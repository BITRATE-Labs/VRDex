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
  managed_output_secret_arn_prefix = var.managed_output_secret_namespace == null ? null : "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:"
  managed_output_secret_arn        = local.managed_output_secret_arn_prefix == null ? null : "${local.managed_output_secret_arn_prefix}${var.managed_output_secret_namespace}*"
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
  count  = local.managed_output_secret_arn == null || local.output_broker_target_role == null ? 0 : 1
  name   = "provision-broadcast-output"
  role   = var.vercel_output_broker == null ? var.output_broker_role_name : aws_iam_role.output_broker[0].id
  policy = data.aws_iam_policy_document.output_broker[0].json
}
output "output_broker_policy_json" {
  description = "Policy for a self-hosted API role when attachment is managed elsewhere."
  value       = try(data.aws_iam_policy_document.output_broker[0].json, null)
}
output "managed_output_secret_arn_prefix" {
  description = "Set VRDEX_EVENT_OUTPUT_SECRET_ARN_PREFIX in Convex. The managed bridge environment receives the same prefix automatically."
  value       = local.managed_output_secret_arn_prefix
}
variable "vercel_output_broker" {
  description = "Opt in to a dedicated broker role for the named Vercel project's production environment. Reuses the existing team OIDC provider; null creates no role or trust."
  type = object({
    team_slug    = optional(string, "basicbit")
    project_name = optional(string, "vr-dex-web")
    role_name    = optional(string, "vrdex-vercel-broadcast-output")
  })
  default = null
  validation {
    condition     = var.vercel_output_broker == null || (var.managed_output_secret_namespace != null && var.output_broker_role_name == null)
    error_message = "A managed Vercel broker needs managed_output_secret_namespace and cannot also use output_broker_role_name."
  }
  validation {
    condition = var.vercel_output_broker == null ? true : (
      can(regex("^[a-z0-9][a-z0-9-]{0,99}$", var.vercel_output_broker.team_slug)) &&
      can(regex("^[a-z0-9][a-z0-9-]{0,99}$", var.vercel_output_broker.project_name)) &&
      can(regex("^[A-Za-z0-9+=,.@_-]{1,64}$", var.vercel_output_broker.role_name))
    )
    error_message = "Use exact Vercel team/project names and a valid dedicated IAM role name, without wildcard subjects."
  }
}

locals {
  output_broker_issuer_path = "oidc.vercel.com/${try(var.vercel_output_broker.team_slug, "basicbit")}"
  output_broker_target_role = var.vercel_output_broker == null ? var.output_broker_role_name : var.vercel_output_broker.role_name
}

data "aws_iam_openid_connect_provider" "output_broker" {
  count = var.vercel_output_broker == null ? 0 : 1
  url   = "https://${local.output_broker_issuer_path}"
}

resource "aws_iam_role" "output_broker" {
  count = var.vercel_output_broker == null ? 0 : 1
  name  = var.vercel_output_broker.role_name
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = data.aws_iam_openid_connect_provider.output_broker[0].arn }
      Condition = { StringEquals = {
        "${local.output_broker_issuer_path}:aud" = "https://vercel.com/${var.vercel_output_broker.team_slug}"
        "${local.output_broker_issuer_path}:sub" = "owner:${var.vercel_output_broker.team_slug}:project:${var.vercel_output_broker.project_name}:environment:production"
      } }
    }]
  })
  tags = local.tags
}

output "output_broker_role_arn" {
  description = "Dedicated Vercel production broker role for VRDEX_EVENT_OUTPUT_BROKER_ROLE_ARN. Null when role creation is disabled."
  value       = try(aws_iam_role.output_broker[0].arn, null)
}
