variable "managed_output_secret_namespace" {
  description = "Opt-in Secrets Manager name prefix for community-owned broadcast output keys. Null disables provisioning policies. Must match the broker-generated namespace."
  type        = string
  default     = null
  validation {
    condition     = var.managed_output_secret_namespace == null || var.managed_output_secret_namespace == "vrdex/broadcast/"
    error_message = "The supported managed output namespace is vrdex/broadcast/."
  }
}
variable "output_broker_role_name" {
  description = "Existing server role used by the authenticated output provisioning API. Null leaves policy unattached. No secret values belong in Terraform."
  type        = string
  default     = null
}
locals {
  managed_output_secret_arn = var.managed_output_secret_namespace == null ? null : "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.managed_output_secret_namespace}*"
}
data "aws_iam_policy_document" "managed_output_execution" {
  count = local.managed_output_secret_arn == null ? 0 : 1
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [local.managed_output_secret_arn]
  }
}
resource "aws_iam_role_policy" "managed_output_execution" {
  count  = local.managed_output_secret_arn == null ? 0 : 1
  name   = "read-managed-broadcast-output"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.managed_output_execution[0].json
}
data "aws_iam_policy_document" "output_broker" {
  count = local.managed_output_secret_arn == null ? 0 : 1
  statement {
    actions   = ["secretsmanager:CreateSecret", "secretsmanager:DescribeSecret", "secretsmanager:TagResource", "secretsmanager:DeleteSecret"]
    resources = [local.managed_output_secret_arn]
  }
}
resource "aws_iam_role_policy" "output_broker" {
  count  = local.managed_output_secret_arn == null || var.output_broker_role_name == null ? 0 : 1
  name   = "provision-broadcast-output"
  role   = var.output_broker_role_name
  policy = data.aws_iam_policy_document.output_broker[0].json
}
output "output_broker_policy_json" {
  description = "Policy for a self-hosted API role when attachment is managed elsewhere."
  value       = try(data.aws_iam_policy_document.output_broker[0].json, null)
}
output "managed_output_secret_arn_prefix" {
  description = "Set VRDEX_EVENT_OUTPUT_SECRET_ARN_PREFIX in Convex and dispatcher. This account-and-region prefix contains no secret."
  value       = var.managed_output_secret_namespace == null ? null : "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:"
}
