# GitHub deployment review documentation input v1

Packaging notice (not GitHub policy): English GitHub.com documentation, pinned to cb051611377a0d2904411e6157154e9b4953d870. Source Markdown bodies below are unchanged; only YAML front matter is omitted. Links, images, Liquid variables and reusable include tags are not expanded or fetched. Only explicit prose is available as policy. This is public product documentation, not an internal PRD. No actual GitHub jobs, accounts or secrets are connected.

Attribution: GitHub and contributors, GitHub Docs, CC BY 4.0. Original source URLs and file hashes are in manifest.json. Changes: concatenation, packaging headings and front-matter removal only.


---

## Source review

Original: https://raw.githubusercontent.com/github/docs/cb051611377a0d2904411e6157154e9b4953d870/content/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments.md


## Approving or rejecting a job

1. Navigate to the workflow run that requires review. For more information about navigating to a workflow run, see [AUTOTITLE](/actions/how-tos/monitor-workflows/view-workflow-run-history).
1. If the run requires review, you will see a notification for the review request. On the notification, click **Review deployments**.
1. Select the job environment(s) to approve or reject. Optionally, leave a comment.
1. Approve or reject:
   * To approve the job, click **Approve and deploy**. Once a job is approved (and any other deployment protection rules have passed), the job will proceed. At this point, the job can access any secrets stored in the environment.
   * To reject the job, click **Reject**. If a job is rejected, the workflow will fail.

> [!NOTE]
> If the targeted environment is configured to prevent self-approvals for deployments, you will not be able to approve a deployment from a workflow run you initiated. For more information, see [AUTOTITLE](/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

## Bypassing deployment protection rules

If you have configured deployment protection rules that control whether software can be deployed to an environment, you can bypass these rules and force all pending jobs referencing the environment to proceed.

> [!NOTE]
> * You cannot bypass deployment protection rules if the environment has been configured to prevent admins from bypassing configured protection rules. For more information, see [AUTOTITLE](/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments#creating-an-environment).
> * You can only bypass deployment protection rules during workflow execution when a job referencing the environment is in a "Pending" state.

1. Navigate to the workflow run. For more information about navigating to a workflow run, see [AUTOTITLE](/actions/how-tos/monitor-workflows/view-workflow-run-history).
1. To the right of **Deployment protection rules**, click **Start all waiting jobs**.
   ![Screenshot of the "Deployment protection rules" section with the "Start all waiting jobs" button outlined in orange.](/assets/images/actions-bypass-env-protection-rules.png)
1. In the pop-up window, select the environments for which you want to bypass deployment protection rules.
1. Under **Leave a comment**, enter a description for bypassing the deployment protection rules.
1. Click **I understand the consequences, start deploying**.


---

## Source reference

Original: https://raw.githubusercontent.com/github/docs/cb051611377a0d2904411e6157154e9b4953d870/content/actions/reference/workflows-and-actions/deployments-and-environments.md


## Deployment protection rules

Deployment protection rules require specific conditions to pass before a job referencing the environment can proceed. You can use deployment protection rules to require a manual approval, delay a job, or restrict the environment to certain branches. You can also create and implement custom protection rules powered by {% data variables.product.prodname_github_apps %} to use third-party systems to control deployments referencing environments configured on {% data variables.product.github %}.

Third-party systems can be observability systems, change management systems, code quality systems, or other manual configurations that you use to assess readiness before deployments are safely rolled out to environments.

{% data reusables.actions.custom-deployment-protection-rules-limits %}

### Required reviewers

Use required reviewers to require a specific person or team to approve workflow jobs that reference the environment. You can list up to six users or teams as reviewers. The reviewers must have at least read access to the repository. Only one of the required reviewers needs to approve the job for it to proceed.

You also have the option to prevent self-reviews for deployments to protected environments. If you enable this setting, users who initiate a deployment cannot approve the deployment job, even if they are a required reviewer. This ensures that deployments to protected environments are always reviewed by more than one person.

For more information on reviewing jobs that reference an environment with required reviewers, see [AUTOTITLE](/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments).

{% ifversion fpt %}

> [!NOTE]
> If you are on a {% data variables.product.prodname_free_user %}, {% data variables.product.prodname_pro %}, or {% data variables.product.prodname_team %} plan, required reviewers are only available for public repositories.

{% endif %}

### Wait timer

Use a wait timer to delay a job for a specific amount of time after the job is initially triggered. The time (in minutes) must be an integer between 1 and 43,200 (30 days). Wait time will not count towards your billable time.

{% ifversion fpt %}

> [!NOTE]
> If you are on a {% data variables.product.prodname_free_user %}, {% data variables.product.prodname_pro %}, or {% data variables.product.prodname_team %} plan, wait timers are only available for public repositories.

{% endif %}

### Deployment branches and tags

Use deployment branches and tags to restrict which branches and tags can deploy to the environment. Below are the options for deployment branches and tags for an environment:

* **No restriction:** No restriction on which branch or tag can deploy to the environment.
* **Protected branches only:** Only branches with branch protection rules enabled can deploy to the environment. If no branch protection rules are defined for any branch in the repository, then all branches can deploy. For more information about branch protection rules, see [AUTOTITLE](/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

  > [!NOTE]
  > Deployment workflow runs triggered by tags with the same name as a protected branch and forks with branches that match the protected branch name cannot deploy to the environment.

* **Selected branches and tags:** Only branches and tags that match your specified name patterns can deploy to the environment.

  The deployment branch or tag rule is matched against the `GITHUB_REF` of the workflow run. For values of `GITHUB_REF` for each workflow trigger, see [AUTOTITLE](/actions/reference/workflows-and-actions/events-that-trigger-workflows). If you specify `releases/*` as a deployment branch or tag rule, only a `GITHUB_REF` whose name begins with `releases/` can deploy to the environment. Adding another branch rule for `refs/pull/*/merge` would also allow workflows triggered by `pull_request` events to deploy to the environment. Wildcard characters will not match `/`, to match branches or tags that begin with `release/` and contain an additional single slash, use `release/*/*`. For more information about syntax options for deployment branches, see the [Ruby `File.fnmatch` documentation](https://ruby-doc.org/core-2.5.1/File.html#method-c-fnmatch).

  {% data reusables.actions.branch-and-tag-deployment-rules-configuration %}

{% ifversion fpt %}

> [!NOTE]
> Deployment branches and tags are available for all public repositories. For users on {% data variables.product.prodname_pro %} or {% data variables.product.prodname_team %} plans, deployment branches and tags are also available for private repositories.

{% endif %}

### Allow administrators to bypass configured protection rules

By default, administrators can bypass the protection rules and force deployments to specific environments. For more information, see [AUTOTITLE](/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments#bypassing-deployment-protection-rules).

Alternatively, you can configure environments to disallow bypassing the protection rules for all deployments to the environment.

{% ifversion fpt %}

> [!NOTE]
> Allowing administrators to bypass protection rules is only available for public repositories for users on {% data variables.product.prodname_free_user %}, {% data variables.product.prodname_pro %}, and {% data variables.product.prodname_team %} plans.

{% endif %}

### Custom deployment protection rules

{% data reusables.actions.custom-deployment-protection-rules-beta-note %}

{% data reusables.actions.about-custom-deployment-protection-rules %} For more information, see [AUTOTITLE](/actions/how-tos/deploy/configure-and-manage-deployments/create-custom-protection-rules).

Once custom deployment protection rules have been created and installed on a repository, you can enable the custom deployment protection rule for any environment in the repository. For more information about configuring and enabling custom deployment protection rules, see [AUTOTITLE](/actions/how-tos/deploy/configure-and-manage-deployments/configure-custom-protection-rules).

{% ifversion fpt %}

> [!NOTE]
> Custom deployment protection rules are only available for public repositories for users on {% data variables.product.prodname_free_user %}, {% data variables.product.prodname_pro %}, and {% data variables.product.prodname_team %} plans.

{% endif %}

## Environment secrets

Secrets stored in an environment are only available to workflow jobs that reference the environment. If the environment requires approval, a job cannot access environment secrets until one of the required reviewers approves it. For more information about secrets, see [AUTOTITLE](/actions/concepts/security/secrets).

{% ifversion fpt %}
> [!NOTE]
> * Workflows that run on self-hosted runners are not run in an isolated container, even if they use environments. Environment secrets should be treated with the same level of security as repository and organization secrets. For more information, see [AUTOTITLE](/actions/reference/security/secure-use#hardening-for-self-hosted-runners).
> * If you are using {% data variables.product.prodname_free_user %}, environment secrets are only available in public repositories. For access to environment secrets in private or internal repositories, you must use {% data variables.product.prodname_pro %}, {% data variables.product.prodname_team %}, or {% data variables.product.prodname_enterprise %}. For more information on switching your plan, see [AUTOTITLE](/billing/how-tos/manage-plan-and-licenses/upgrade-plan).

{% else %}

> [!NOTE]
> Workflows that run on self-hosted runners are not run in an isolated container, even if they use environments. Environment secrets should be treated with the same level of security as repository and organization secrets. For more information, see [AUTOTITLE](/actions/reference/security/secure-use#hardening-for-self-hosted-runners).

{% endif %}

## Environment variables

Variables stored in an environment are only available to workflow jobs that reference the environment. These variables are only accessible using the [`vars`](/actions/reference/workflows-and-actions/contexts#vars-context) context. For more information, see [AUTOTITLE](/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables).

{% ifversion fpt %}

> [!NOTE]
> Environment variables are available for all public repositories. For users on {% data variables.product.prodname_pro %} or {% data variables.product.prodname_team %} plans, environment variables are also available for private repositories.

{% endif %}


---

## Source manage

Original: https://raw.githubusercontent.com/github/docs/cb051611377a0d2904411e6157154e9b4953d870/content/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments.md


## Prerequisites

{% ifversion fpt %}

> [!NOTE]
> Users with {% data variables.product.prodname_free_user %} plans can only configure environments for public repositories. If you convert a repository from public to private, any configured protection rules or environment secrets will be ignored, and you will not be able to configure any environments. If you convert your repository back to public, you will have access to any previously configured protection rules and environment secrets.
>
> Organizations with {% data variables.product.prodname_team %} and users with {% data variables.product.prodname_pro %} can configure environments for private repositories. For more information, see [AUTOTITLE](/get-started/learning-about-github/githubs-plans).

{% endif %}

* For general information about environments, see [AUTOTITLE](/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments#using-environments).
* For information about available rules, see [AUTOTITLE](/actions/reference/workflows-and-actions/deployments-and-environments).

## Creating an environment

{% data reusables.actions.permissions-statement-environment %}

{% ifversion fpt %}

> [!NOTE]
> * Creation of an environment in a private repository is available to organizations with {% data variables.product.prodname_team %} and users with {% data variables.product.prodname_pro %}.
> * Some features for environments have no or limited availability for private repositories. If you are unable to access a feature described in the instructions below, please see the documentation linked in the related step for availability information.

{% endif %}

{% data reusables.repositories.navigate-to-repo %}
{% data reusables.repositories.sidebar-settings %}
{% data reusables.actions.sidebar-environment %}
{% data reusables.actions.new-environment %}
{% data reusables.actions.name-environment %}
1. Optionally, specify people or teams that must approve workflow jobs that use this environment. For more information, see [AUTOTITLE](/actions/reference/workflows-and-actions/deployments-and-environments#required-reviewers).
   1. Select **Required reviewers**.
   1. Enter up to 6 people or teams. Only one of the required reviewers needs to approve the job for it to proceed.
   1. Optionally, to prevent users from approving workflows runs that they triggered, select **Prevent self-review**.
   1. Click **Save protection rules**.
1. Optionally, specify the amount of time to wait before allowing workflow jobs that use this environment to proceed. For more information, see [AUTOTITLE](/actions/reference/workflows-and-actions/deployments-and-environments#wait-timer).
   1. Select **Wait timer**.
   1. Enter the number of minutes to wait.
   1. Click **Save protection rules**.
1. Optionally, disallow bypassing configured protection rules. For more information, see [AUTOTITLE](/actions/reference/workflows-and-actions/deployments-and-environments#allow-administrators-to-bypass-configured-protection-rules).
   1. Deselect **Allow administrators to bypass configured protection rules**.
   1. Click **Save protection rules**.
1. Optionally, enable any custom deployment protection rules that have been created with {% data variables.product.prodname_github_apps %}. For more information, see [AUTOTITLE](/actions/reference/workflows-and-actions/deployments-and-environments#custom-deployment-protection-rules).
   1. Select the custom protection rule you want to enable.
   1. Click **Save protection rules**.
1. Optionally, specify what branches and tags can deploy to this environment. For more information, see [AUTOTITLE](/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags).
   1. Select the desired option in the **Deployment branches** dropdown.
   1. If you chose **Selected branches and tags**, to add a new rule, click **Add deployment branch or tag rule**
   1. In the "Ref type" dropdown menu, depending on what rule you want to apply, click **{% octicon "git-branch" aria-hidden="true" aria-label="git-branch" %} Branch** or **{% octicon "tag" aria-hidden="true" aria-label="tag" %} Tag**.
   1. Enter the name pattern for the branch or tag that you want to allow.

      {% data reusables.actions.branch-and-tag-deployment-rules-configuration %}

   1. Click **Add rule**.
1. Optionally, add environment secrets. These secrets are only available to workflow jobs that use the environment. Additionally, workflow jobs that use this environment can only access these secrets after any configured rules (for example, required reviewers) pass. For more information, see [AUTOTITLE](/actions/reference/workflows-and-actions/deployments-and-environments#environment-secrets).
   1. Under **Environment secrets**, click **Add Secret**.
   1. Enter the secret name.
   1. Enter the secret value.
   1. Click **Add secret**.
1. Optionally, add environment variables. These variables are only available to workflow jobs that use the environment, and are only accessible using the [`vars`](/actions/reference/workflows-and-actions/contexts#vars-context) context. For more information, see [AUTOTITLE](/actions/reference/workflows-and-actions/deployments-and-environments#environment-variables).
   1. Under **Environment variables**, click **Add Variable**.
   1. Enter the variable name.
   1. Enter the variable value.
   1. Click **Add variable**.

You can also create and configure environments through the REST API. For more information, see [AUTOTITLE](/rest/deployments/environments), [AUTOTITLE](/rest/actions/secrets), [AUTOTITLE](/rest/actions/variables), and [AUTOTITLE](/rest/deployments/branch-policies).

Running a workflow that references an environment that does not exist will create an environment with the referenced name. If the environment is created from running implicit page builds (for example, from a branch or folder source), the source branch will be added as a protection rule to the environment. Otherwise, the newly created environment will not have any protection rules or secrets configured. Anyone that can edit workflows in the repository can create environments via a workflow file, but only repository admins can configure the environment.

## Deleting an environment

{% data reusables.actions.permissions-statement-environment %}

Deleting an environment will delete all secrets and protection rules associated with the environment. Any jobs currently waiting because of protection rules from the deleted environment will automatically fail.

{% data reusables.repositories.navigate-to-repo %}
{% data reusables.repositories.sidebar-settings %}
{% data reusables.actions.sidebar-environment %}
1. Next to the environment that you want to delete, click {% octicon "trash" aria-label="Delete environment" %}.
1. Click **I understand, delete this environment**.

You can also delete environments through the REST API. For more information, see [AUTOTITLE](/rest/repos#environments).

## How environments relate to deployments

{% data reusables.actions.environment-deployment-event %}

You can access these objects through the REST API or GraphQL API. You can also subscribe to these webhook events. For more information, see [AUTOTITLE](/rest/repos#deployments), [AUTOTITLE](/graphql/reference/deployments#object-deployment) (GraphQL API), or [AUTOTITLE](/webhooks/webhook-events-and-payloads#deployment).

## Next steps

{% data variables.product.prodname_actions %} provides several features for managing your deployments. For more information, see [AUTOTITLE](/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments).
