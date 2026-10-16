// Hand-written, human-reviewed extractions used to test the engine in isolation.
// They play the role of "a correct extraction after human review". They are not the oracle:
// expected outcomes come from the frozen contracts in test/contracts/.

export const githubModel = {
  variables: [
    { id: 'job_state', values: ['pending_approval', 'already_running'], initial: 'pending_approval' },
    { id: 'review_decision', values: ['not_approved', 'approved', 'rejected'], initial: 'not_approved' },
    { id: 'workflow_state', values: ['active', 'failed'], initial: 'active' },
    { id: 'job_may_proceed', values: [false, true], initial: false },
    { id: 'environment_secrets_eligible', values: [false, true], initial: false },
  ],
  settings: [
    { id: 'prevent_self_review', label: 'Prevent self-review', quote: 'If you enable this setting, users who initiate a deployment cannot approve the deployment job, even if they are a required reviewer.' },
    { id: 'allow_admin_bypass', label: 'Admin bypass allowed', quote: 'By default, administrators can bypass the protection rules and force deployments to specific environments.' },
    { id: 'other_rules_passed', label: 'Other rules passed', quote: 'Once a job is approved (and any other deployment protection rules have passed), the job will proceed.' },
  ],
  roles: [
    { id: 'reviewer', label: 'Required reviewer', quote: 'Use required reviewers to require a specific person or team to approve workflow jobs that reference the environment.' },
    { id: 'admin', label: 'Administrator', quote: 'By default, administrators can bypass the protection rules and force deployments to specific environments.' },
  ],
  relations: [
    { id: 'initiated_run', label: 'Started the run', quote: 'you will not be able to approve a deployment from a workflow run you initiated.' },
  ],
  inputs: [],
  actions: [
    { id: 'approve', label: 'Approve and deploy' },
    { id: 'reject', label: 'Reject' },
    { id: 'bypass', label: 'Bypass protection rules' },
  ],
  rules: [
    {
      id: 'approve-proceeds', action: 'approve', roles: ['reviewer'],
      when: [{ var: 'job_state', op: 'eq', value: 'pending_approval' }, { setting: 'other_rules_passed', op: 'eq', value: true }],
      effect: { review_decision: 'approved', job_may_proceed: true, environment_secrets_eligible: true },
      quote: 'Once a job is approved (and any other deployment protection rules have passed), the job will proceed. At this point, the job can access any secrets stored in the environment.',
    },
    {
      id: 'approve-gated', action: 'approve', roles: ['reviewer'],
      when: [{ var: 'job_state', op: 'eq', value: 'pending_approval' }, { setting: 'other_rules_passed', op: 'eq', value: false }],
      effect: { review_decision: 'approved' },
      quote: 'Deployment protection rules require specific conditions to pass before a job referencing the environment can proceed.',
    },
    {
      id: 'reject-fails', action: 'reject', roles: ['reviewer'],
      when: [{ var: 'job_state', op: 'eq', value: 'pending_approval' }],
      effect: { review_decision: 'rejected', workflow_state: 'failed' },
      quote: 'If a job is rejected, the workflow will fail.',
    },
    {
      id: 'bypass-proceeds', action: 'bypass', roles: ['admin'],
      when: [{ var: 'job_state', op: 'eq', value: 'pending_approval' }],
      effect: { job_may_proceed: true },
      quote: 'you can bypass these rules and force all pending jobs referencing the environment to proceed.',
    },
  ],
  prohibitions: [
    {
      id: 'no-self-approval', action: 'approve', roles: [],
      when: [{ setting: 'prevent_self_review', op: 'eq', value: true }, { relation: 'initiated_run', op: 'eq', value: true }],
      quote: 'If you enable this setting, users who initiate a deployment cannot approve the deployment job, even if they are a required reviewer.',
    },
    {
      id: 'no-bypass-when-disallowed', action: 'bypass', roles: [],
      when: [{ setting: 'allow_admin_bypass', op: 'eq', value: false }],
      quote: 'You cannot bypass deployment protection rules if the environment has been configured to prevent admins from bypassing configured protection rules.',
    },
    {
      id: 'bypass-only-pending', action: 'bypass', roles: [],
      when: [{ var: 'job_state', op: 'ne', value: 'pending_approval' }],
      quote: 'You can only bypass deployment protection rules during workflow execution when a job referencing the environment is in a "Pending" state.',
    },
  ],
};

function syntheticBase(limit) {
  return {
    variables: [{ id: 'status', values: ['draft', 'pending', 'approved', 'rejected'], initial: 'draft' }],
    settings: [],
    roles: [
      { id: 'requester', quote: 'Only the requester may submit it' },
      { id: 'reviewer', quote: 'Only the reviewer may approve or reject a pending request.' },
    ],
    relations: [],
    inputs: [{ id: 'units', type: 'integer', quote: 'integer units' }],
    actions: [{ id: 'submit' }, { id: 'approve' }, { id: 'reject' }],
    rules: [
      { id: 'R1', action: 'submit', roles: ['requester'], when: [{ var: 'status', op: 'eq', value: 'draft' }], effect: { status: 'pending' }, quote: 'submit changes draft to pending.' },
      { id: 'R3', action: 'approve', roles: ['reviewer'], when: [{ var: 'status', op: 'eq', value: 'pending' }, { input: 'units', op: 'lte', value: limit }], effect: { status: 'approved' }, quote: 'a permitted approve changes pending to approved.' },
      { id: 'R4', action: 'reject', roles: ['reviewer'], when: [{ var: 'status', op: 'eq', value: 'pending' }], effect: { status: 'rejected' }, quote: 'Reject changes pending to rejected.' },
    ],
    prohibitions: [
      { id: 'R2', action: 'approve', roles: ['requester'], when: [], quote: 'Other actors must not perform these actions.' },
      { id: 'R2b', action: 'reject', roles: ['requester'], when: [], quote: 'Other actors must not perform these actions.' },
      { id: 'R3-limit', action: 'approve', roles: [], when: [{ var: 'status', op: 'eq', value: 'pending' }, { input: 'units', op: 'gt', value: limit }], quote: `If units > ${limit}, approve is forbidden and status remains pending.` },
      ...['submit', 'approve', 'reject'].map((a) => ({
        id: `R5-${a}`, action: a, roles: [], when: [{ var: 'status', op: 'in', value: ['approved', 'rejected'] }],
        quote: 'Approved and rejected are terminal; further submit, approve or reject actions are not permitted.',
      })),
    ],
  };
}

export const syntheticModels = {
  complete: syntheticBase(100),
  'limit-200': syntheticBase(200),
  'missing-outcome': (() => {
    const m = syntheticBase(100);
    const r3 = m.rules.find((r) => r.id === 'R3');
    r3.effect = null;
    r3.quote = 'The resulting status is not specified in this test document.';
    return m;
  })(),
  contradiction: (() => {
    const m = syntheticBase(100);
    m.rules.push({
      id: 'R6', action: 'approve', roles: ['reviewer'],
      when: [{ var: 'status', op: 'eq', value: 'pending' }, { input: 'units', op: 'lte', value: 100 }],
      effect: { status: 'rejected' }, quote: 'a permitted approve changes pending to rejected.',
    });
    return m;
  })(),
};
