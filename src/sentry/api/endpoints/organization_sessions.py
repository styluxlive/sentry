from contextlib import contextmanager
from typing import Optional

import sentry_sdk
from django.utils.datastructures import MultiValueDict
from rest_framework.exceptions import ParseError
from rest_framework.request import Request
from rest_framework.response import Response

from sentry import release_health
from sentry.api.api_owners import ApiOwner
from sentry.api.api_publish_status import ApiPublishStatus
from sentry.api.base import region_silo_endpoint
from sentry.api.bases import NoProjects
from sentry.api.bases.organization import OrganizationEndpoint
from sentry.api.paginator import GenericOffsetPaginator
from sentry.api.utils import handle_query_errors
from sentry.exceptions import InvalidParams
from sentry.models.organization import Organization
from sentry.snuba.sessions_v2 import SNUBA_LIMIT, InvalidField, QueryDefinition
from sentry.utils.cursors import Cursor, CursorResult


@region_silo_endpoint
class OrganizationSessionsEndpoint(OrganizationEndpoint):
    publish_status = {
        "GET": ApiPublishStatus.UNKNOWN,
    }
    owner = ApiOwner.TELEMETRY_EXPERIENCE

    def get(self, request: Request, organization) -> Response:
        def data_fn(offset: int, limit: int):
            with self.handle_query_errors():
                with sentry_sdk.start_span(
                    op="sessions.endpoint", description="build_sessions_query"
                ):
                    request_limit = None
                    if request.GET.get("per_page") is not None:
                        request_limit = limit
                    request_offset = None
                    if request.GET.get("cursor") is not None:
                        request_offset = offset

                    query = self.build_sessions_query(
                        request, organization, offset=request_offset, limit=request_limit
                    )

                return release_health.backend.run_sessions_query(
                    organization.id, query, span_op="sessions.endpoint"
                )

        return self.paginate(
            request,
            paginator=SessionsDataSeriesPaginator(data_fn=data_fn),
            default_per_page=SNUBA_LIMIT,
            max_per_page=SNUBA_LIMIT,
        )

    def build_sessions_query(
        self,
        request: Request,
        organization: Organization,
        offset: Optional[int],
        limit: Optional[int],
    ):
        try:
            params = self.get_filter_params(request, organization, date_filter_optional=True)
        except NoProjects:
            raise NoProjects("No projects available")  # give it a description

        # HACK to prevent front-end crash when release health is sessions-based:
        query_params = MultiValueDict(request.GET)
        if not release_health.backend.is_metrics_based() and request.GET.get("interval") == "10s":
            query_params["interval"] = "1m"

        query_config = release_health.backend.sessions_query_config(organization)

        return QueryDefinition(
            query=query_params,
            params=params,
            offset=offset,
            limit=limit,
            query_config=query_config,
        )

    @contextmanager
    def handle_query_errors(self):
        try:
            with handle_query_errors():
                yield
        except (InvalidField, InvalidParams, NoProjects) as error:
            raise ParseError(detail=str(error))


class SessionsDataSeriesPaginator(GenericOffsetPaginator):
    def get_result(self, limit, cursor=None):
        assert limit > 0
        offset = cursor.offset if cursor is not None else 0
        data = self.data_fn(offset=offset, limit=limit + 1)

        if isinstance(data.get("groups"), list):
            has_more = len(data["groups"]) == limit + 1
            if has_more:
                data["groups"].pop()
        else:
            raise NotImplementedError

        return CursorResult(
            data,
            prev=Cursor(0, max(0, offset - limit), True, offset > 0),
            next=Cursor(0, max(0, offset + limit), False, has_more),
        )
