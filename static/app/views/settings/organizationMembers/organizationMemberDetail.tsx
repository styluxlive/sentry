import {Fragment} from 'react';
import type {RouteComponentProps} from 'react-router';
import styled from '@emotion/styled';
import * as Sentry from '@sentry/react';
import isEqual from 'lodash/isEqual';

import {removeAuthenticator} from 'sentry/actionCreators/account';
import {
  addErrorMessage,
  addLoadingMessage,
  addSuccessMessage,
} from 'sentry/actionCreators/indicator';
import {resendMemberInvite, updateMember} from 'sentry/actionCreators/members';
import {Button} from 'sentry/components/button';
import Confirm from 'sentry/components/confirm';
import DateTime from 'sentry/components/dateTime';
import NotFound from 'sentry/components/errors/notFound';
import FieldGroup from 'sentry/components/forms/fieldGroup';
import HookOrDefault from 'sentry/components/hookOrDefault';
import ExternalLink from 'sentry/components/links/externalLink';
import Panel from 'sentry/components/panels/panel';
import PanelBody from 'sentry/components/panels/panelBody';
import PanelHeader from 'sentry/components/panels/panelHeader';
import PanelItem from 'sentry/components/panels/panelItem';
import {Tooltip} from 'sentry/components/tooltip';
import {IconRefresh} from 'sentry/icons';
import {t, tct} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import {Member, Organization} from 'sentry/types';
import isMemberDisabledFromLimit from 'sentry/utils/isMemberDisabledFromLimit';
import Teams from 'sentry/utils/teams';
import {normalizeUrl} from 'sentry/utils/withDomainRequired';
import withOrganization from 'sentry/utils/withOrganization';
import DeprecatedAsyncView, {AsyncViewState} from 'sentry/views/deprecatedAsyncView';
import SettingsPageHeader from 'sentry/views/settings/components/settingsPageHeader';
import TeamSelectForMember from 'sentry/views/settings/components/teamSelect/teamSelectForMember';

import OrganizationRoleSelect from './inviteMember/orgRoleSelect';

const MULTIPLE_ORGS = t('Cannot be reset since user is in more than one organization');
const NOT_ENROLLED = t('Not enrolled in two-factor authentication');
const NO_PERMISSION = t('You do not have permission to perform this action');
const TWO_FACTOR_REQUIRED = t(
  'Cannot be reset since two-factor is required for this organization'
);

type RouteParams = {
  memberId: string;
};

interface Props extends RouteComponentProps<RouteParams, {}> {
  organization: Organization;
}

interface State extends AsyncViewState {
  groupOrgRoles: Member['groupOrgRoles']; // Form state
  member: Member | null;
  orgRole: Member['orgRole']; // Form state
  teamRoles: Member['teamRoles']; // Form state
}

const DisabledMemberTooltip = HookOrDefault({
  hookName: 'component:disabled-member-tooltip',
  defaultComponent: ({children}) => <Fragment>{children}</Fragment>,
});

class OrganizationMemberDetail extends DeprecatedAsyncView<Props, State> {
  get hasTeamRoles() {
    const {organization} = this.props;
    return organization.features.includes('team-roles');
  }

  getDefaultState(): State {
    return {
      ...super.getDefaultState(),
      groupOrgRoles: [],
      member: null,
      orgRole: '',
      teamRoles: [],
    };
  }

  getEndpoints(): ReturnType<DeprecatedAsyncView['getEndpoints']> {
    const {organization, params} = this.props;
    return [
      ['member', `/organizations/${organization.slug}/members/${params.memberId}/`],
    ];
  }

  onRequestSuccess({data, stateKey}: {data: Member; stateKey: string}) {
    if (stateKey === 'member') {
      const {orgRole, teamRoles, groupOrgRoles} = data;
      this.setState({
        orgRole,
        teamRoles,
        groupOrgRoles,
      });
    }
  }

  handleSave = async () => {
    const {organization, params} = this.props;
    const {orgRole, teamRoles} = this.state;

    addLoadingMessage(t('Saving...'));
    this.setState({busy: true});

    try {
      const updatedMember = await updateMember(this.api, {
        orgId: organization.slug,
        memberId: params.memberId,
        data: {orgRole, teamRoles} as any,
      });
      this.setState({
        member: updatedMember,
        orgRole: updatedMember.orgRole,
        teamRoles: updatedMember.teamRoles,
        busy: false,
      });
      addSuccessMessage(t('Saved'));
    } catch (resp) {
      const errorMessage =
        (resp && resp.responseJSON && resp.responseJSON.detail) || t('Could not save...');
      this.setState({busy: false});
      addErrorMessage(errorMessage);
    }
  };

  handleInvite = async (regenerate: boolean) => {
    const {organization, params} = this.props;

    addLoadingMessage(t('Sending invite...'));

    this.setState({busy: true});

    try {
      const data = await resendMemberInvite(this.api, {
        orgId: organization.slug,
        memberId: params.memberId,
        regenerate,
      });

      addSuccessMessage(t('Sent invite!'));

      if (regenerate) {
        this.setState(state => ({member: {...state.member, ...data}}));
      }
    } catch (_err) {
      addErrorMessage(t('Could not send invite'));
    }

    this.setState({busy: false});
  };

  handle2faReset = async () => {
    const {organization, router} = this.props;
    const {user} = this.state.member!;

    const requests =
      user?.authenticators?.map(auth =>
        removeAuthenticator(this.api, user.id, auth.id)
      ) ?? [];

    try {
      await Promise.all(requests);
      router.push(normalizeUrl(`/settings/${organization.slug}/members/`));
      addSuccessMessage(t('All authenticators have been removed'));
    } catch (err) {
      addErrorMessage(t('Error removing authenticators'));
      Sentry.captureException(err);
    }
  };

  onAddTeam = (teamSlug: string) => {
    const teamRoles = [...this.state.teamRoles];
    const i = teamRoles.findIndex(r => r.teamSlug === teamSlug);
    if (i !== -1) {
      return;
    }

    teamRoles.push({teamSlug, role: null});
    this.setState({teamRoles});
  };

  onRemoveTeam = (teamSlug: string) => {
    const teamRoles = this.state.teamRoles.filter(r => r.teamSlug !== teamSlug);
    this.setState({teamRoles});
  };

  onChangeOrgRole = orgRole => this.setState({orgRole});

  onChangeTeamRole = (teamSlug: string, role: string) => {
    if (!this.hasTeamRoles) {
      return;
    }

    const teamRoles = [...this.state.teamRoles];
    const i = teamRoles.findIndex(r => r.teamSlug === teamSlug);
    if (i === -1) {
      return;
    }

    teamRoles[i] = {...teamRoles[i], role};
    this.setState({teamRoles});
  };

  showResetButton = () => {
    const {organization} = this.props;
    const {member} = this.state;
    const {user} = member!;

    if (!user || !user.authenticators || organization.require2FA) {
      return false;
    }
    const hasAuth = user.authenticators.length >= 1;
    return hasAuth && user.canReset2fa;
  };

  getTooltip = (): string => {
    const {organization} = this.props;
    const {member} = this.state;
    const {user} = member!;

    if (!user) {
      return '';
    }

    if (!user.authenticators) {
      return NO_PERMISSION;
    }
    if (!user.authenticators.length) {
      return NOT_ENROLLED;
    }
    if (!user.canReset2fa) {
      return MULTIPLE_ORGS;
    }
    if (organization.require2FA) {
      return TWO_FACTOR_REQUIRED;
    }

    return '';
  };

  get memberDeactivated() {
    return isMemberDisabledFromLimit(this.state.member);
  }

  get hasFormChanged() {
    const {member, orgRole, teamRoles} = this.state;
    if (!member) {
      return false;
    }

    if (orgRole !== member.orgRole || !isEqual(teamRoles, member.teamRoles)) {
      return true;
    }

    return false;
  }

  renderMemberStatus(member: Member) {
    if (this.memberDeactivated) {
      return (
        <em>
          <DisabledMemberTooltip>{t('Deactivated')}</DisabledMemberTooltip>
        </em>
      );
    }
    if (member.expired) {
      return <em>{t('Invitation Expired')}</em>;
    }
    if (member.pending) {
      return <em>{t('Invitation Pending')}</em>;
    }
    return t('Active');
  }

  renderBody() {
    const {organization} = this.props;
    const {member, orgRole, teamRoles} = this.state;

    if (!member) {
      return <NotFound />;
    }

    const {access, orgRoleList} = organization;
    const canEdit = access.includes('org:write') && !this.memberDeactivated;
    const isPartnershipUser = member.flags['partnership:restricted'] === true;

    const {email, expired, pending} = member;
    const canResend = !expired;
    const showAuth = !pending;

    const showResendButton = (member.pending || member.expired) && canResend;

    return (
      <Fragment>
        <SettingsPageHeader
          title={
            <Fragment>
              <div>{member.name}</div>
              <ExtraHeaderText>{t('Member Settings')}</ExtraHeaderText>
            </Fragment>
          }
        />

        <Panel>
          <PanelHeader hasButtons={showResendButton}>
            {t('Basics')}

            {showResendButton && (
              <Button
                data-test-id="resend-invite"
                size="xs"
                priority="primary"
                icon={<IconRefresh />}
                title={t('Generate a new invite link and send a new email.')}
                onClick={() => this.handleInvite(true)}
              >
                {t('Resend Invite')}
              </Button>
            )}
          </PanelHeader>

          <PanelBody>
            <PanelItem>
              <Details>
                <div>
                  <DetailLabel>{t('Email')}</DetailLabel>
                  <div>
                    <ExternalLink href={`mailto:${email}`}>{email}</ExternalLink>
                  </div>
                </div>
                <div>
                  <DetailLabel>{t('Status')}</DetailLabel>
                  <div data-test-id="member-status">
                    {this.renderMemberStatus(member)}
                  </div>
                </div>
                <div>
                  <DetailLabel>{t('Added')}</DetailLabel>
                  <div>
                    <DateTime dateOnly date={member.dateCreated} />
                  </div>
                </div>
              </Details>
            </PanelItem>
          </PanelBody>
        </Panel>

        {showAuth && (
          <Panel>
            <PanelHeader>{t('Authentication')}</PanelHeader>
            <PanelBody>
              <FieldGroup
                alignRight
                flexibleControlStateSize
                label={t('Reset two-factor authentication')}
                help={t(
                  'Resetting two-factor authentication will remove all two-factor authentication methods for this member.'
                )}
              >
                <Tooltip disabled={this.showResetButton()} title={this.getTooltip()}>
                  <Confirm
                    disabled={!this.showResetButton()}
                    message={tct(
                      'Are you sure you want to disable all two-factor authentication methods for [name]?',
                      {name: member.name ? member.name : 'this member'}
                    )}
                    onConfirm={this.handle2faReset}
                  >
                    <Button priority="danger">
                      {t('Reset two-factor authentication')}
                    </Button>
                  </Confirm>
                </Tooltip>
              </FieldGroup>
            </PanelBody>
          </Panel>
        )}

        <OrganizationRoleSelect
          enforceAllowed={false}
          enforceRetired={this.hasTeamRoles}
          disabled={!canEdit || isPartnershipUser}
          roleList={orgRoleList}
          roleSelected={orgRole}
          setSelected={this.onChangeOrgRole}
          helpText={
            isPartnershipUser
              ? t('You cannot make changes to this partner-provisioned user.')
              : undefined
          }
        />

        <Teams slugs={member.teams}>
          {({initiallyLoaded}) => (
            <Fragment>
              <TeamSelectForMember
                disabled={!canEdit}
                organization={organization}
                member={member}
                selectedOrgRole={orgRole}
                selectedTeamRoles={teamRoles}
                onChangeTeamRole={this.onChangeTeamRole}
                onAddTeam={this.onAddTeam}
                onRemoveTeam={this.onRemoveTeam}
                loadingTeams={!initiallyLoaded}
              />
            </Fragment>
          )}
        </Teams>

        <Footer>
          <Button
            priority="primary"
            busy={this.state.busy}
            onClick={this.handleSave}
            disabled={!canEdit || !this.hasFormChanged}
          >
            {t('Save Member')}
          </Button>
        </Footer>
      </Fragment>
    );
  }
}

export default withOrganization(OrganizationMemberDetail);

const ExtraHeaderText = styled('div')`
  color: ${p => p.theme.gray300};
  font-weight: normal;
  font-size: ${p => p.theme.fontSizeLarge};
`;

const Details = styled('div')`
  display: grid;
  grid-auto-flow: column;
  grid-template-columns: 2fr 1fr 1fr;
  gap: ${space(2)};
  width: 100%;

  @media (max-width: ${p => p.theme.breakpoints.small}) {
    grid-auto-flow: row;
    grid-template-columns: auto;
  }
`;

const DetailLabel = styled('div')`
  font-weight: bold;
  margin-bottom: ${space(0.5)};
  color: ${p => p.theme.textColor};
`;

const Footer = styled('div')`
  display: flex;
  justify-content: flex-end;
`;
