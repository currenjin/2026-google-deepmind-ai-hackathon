# Synthetic request specification v1
Origin: authored test specification, not an actual customer PRD or Cal.com policy.
Scope: one request, requester and reviewer roles, integer units, no external services.
R1. A new request is draft. Only the requester may submit it; submit changes draft to pending.
R2. Only the reviewer may approve or reject a pending request. Other actors must not perform these actions.
R3. Approve is permitted only when units <= 200; a permitted approve changes pending to approved. If units > 200, approve is forbidden and status remains pending.
R4. Reject changes pending to rejected.
R5. Approved and rejected are terminal; further submit, approve or reject actions are not permitted.
