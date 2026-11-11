mock_provider "aws" {
  mock_data "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::079358094174:oidc-provider/oidc.vercel.com/basicbit" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::079358094174:role/mock-bridge-role" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "079358094174" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws", dns_suffix = "amazonaws.com" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

override_resource {
  target = aws_ecs_cluster.worker
  values = { arn = "arn:aws:ecs:us-east-1:079358094174:cluster/vrdex-restream-worker" }
}
override_resource {
  target = aws_iam_role.execution
  values = { arn = "arn:aws:iam::079358094174:role/vrdex-restream-worker-execution" }
}
override_resource {
  target = aws_iam_role.task
  values = { arn = "arn:aws:iam::079358094174:role/vrdex-restream-worker-task" }
}
override_resource {
  target = aws_s3_bucket.artifacts
  values = {
    arn    = "arn:aws:s3:::vrdex-restream-worker-079358094174-artifacts"
    bucket = "vrdex-restream-worker-079358094174-artifacts"
  }
}
override_resource {
  target = aws_ecr_repository.worker
  values = { arn = "arn:aws:ecr:us-east-1:079358094174:repository/vrdex-restream-worker" }
}
override_resource {
  target = aws_cloudwatch_log_group.worker
  values = { arn = "arn:aws:logs:us-east-1:079358094174:log-group:/aws/ecs/vrdex-restream-worker" }
}

override_resource {
  target = aws_cloudwatch_log_group.bridge
  values = { arn = "arn:aws:logs:us-east-1:079358094174:log-group:/aws/lambda/vrdex-restream-worker-event-bridge" }
}
override_resource {
  target = aws_lambda_function.bridge
  values = { arn = "arn:aws:lambda:us-east-1:079358094174:function:vrdex-restream-worker-event-bridge" }
}
override_resource {
  target = aws_cloudwatch_event_rule.bridge
  values = { arn = "arn:aws:events:us-east-1:079358094174:rule/vrdex-restream-worker-event-bridge" }
}


run "disabled_by_default" {
  command = plan
  assert {
    condition     = length(aws_iam_role.output_broker) == 0 && length(aws_iam_role_policy.output_broker) == 0 && length(aws_iam_role_policy.managed_output_execution) == 0 && length(data.aws_iam_openid_connect_provider.output_broker) == 0
    error_message = "Default deployment must create no broker role, grants or OIDC lookup."
  }
}
run "production_oidc_broker" {
  command = plan
  variables {
    managed_output_secret_namespace = "vrdex/broadcast/"
    vercel_output_broker            = {}
  }
  assert {
    condition     = aws_iam_role.output_broker[0].name == "vrdex-vercel-broadcast-output" && length(aws_iam_role_policy.output_broker) == 1 && length(aws_iam_role_policy.managed_output_execution) == 1
    error_message = "Opt-in must create the dedicated broker and attach both scoped policies."
  }
  assert {
    condition = jsondecode(aws_iam_role.output_broker[0].assume_role_policy).Statement == [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = "arn:aws:iam::079358094174:oidc-provider/oidc.vercel.com/basicbit" }
      Condition = { StringEquals = {
        "oidc.vercel.com/basicbit:aud" = "https://vercel.com/basicbit"
        "oidc.vercel.com/basicbit:sub" = "owner:basicbit:project:vr-dex-web:environment:production"
      } }
    }]
    error_message = "Trust must match exactly the existing provider, production project subject and audience."
  }
  assert {
    condition     = toset(one(data.aws_iam_policy_document.output_broker[0].statement).actions) == toset(["secretsmanager:CreateSecret", "secretsmanager:DescribeSecret", "secretsmanager:TagResource", "secretsmanager:DeleteSecret"]) && toset(one(data.aws_iam_policy_document.output_broker[0].statement).resources) == toset(["arn:aws:secretsmanager:us-east-1:079358094174:secret:vrdex/broadcast/*"])
    error_message = "Broker writes must stay within the exact account, region and output namespace."
  }
}
run "existing_workload_role" {
  command = plan
  variables {
    managed_output_secret_namespace = "vrdex/broadcast/"
    output_broker_role_name         = "existing-self-hosted-role"
  }
  assert {
    condition     = length(aws_iam_role.output_broker) == 0 && length(data.aws_iam_openid_connect_provider.output_broker) == 0 && aws_iam_role_policy.output_broker[0].role == "existing-self-hosted-role"
    error_message = "Self-hosted attachment must not create or change workload trust."
  }
}
run "managed_role_needs_namespace" {
  command = plan
  variables { vercel_output_broker = {} }
  expect_failures = [var.vercel_output_broker]
}
run "reject_ambiguous_role_ownership" {
  command = plan
  variables {
    managed_output_secret_namespace = "vrdex/broadcast/"
    vercel_output_broker            = {}
    output_broker_role_name         = "existing-self-hosted-role"
  }
  expect_failures = [var.vercel_output_broker]
}
run "reject_wildcard_subject" {
  command = plan
  variables {
    managed_output_secret_namespace = "vrdex/broadcast/"
    vercel_output_broker            = { project_name = "*" }
  }
  expect_failures = [var.vercel_output_broker]
}
variables {
  event_media_bridge = {
    convex_url         = "https://production-example.convex.cloud"
    image              = "079358094174.dkr.ecr.us-east-1.amazonaws.com/vrdex-restream-worker@sha256:fa5515d574355d6a647ce8390285f62edec1ad4f7e6e98956230c0b1391c2548"
    bundle_key         = "event-media-bridge/sha256/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.zip"
    bundle_sha256      = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    token_secret_arn   = "arn:aws:secretsmanager:us-east-1:079358094174:secret:event-media/bridge-token-AbCdEf"
    credential_refs    = { "vrcdn:authorized-account" = "arn:aws:secretsmanager:us-east-1:079358094174:secret:event-media/output-AbCdEf" }
    subnet_ids         = ["subnet-0123456789abcdef0"]
    security_group_ids = ["sg-0123456789abcdef0"]
  }
}


run "bridge_managed_prefix" {
  command = plan
  variables {
    enable_event_media_bridge       = true
    managed_output_secret_namespace = "vrdex/broadcast/"
  }
  assert {
    condition     = lookup(aws_lambda_function.bridge[0].environment[0].variables, "VRDEX_EVENT_OUTPUT_SECRET_ARN_PREFIX", "") == output.managed_output_secret_arn_prefix
    error_message = "The managed dispatcher prefix must derive from the same account/region binding as the module output."
  }
  assert {
    condition     = tomap(jsondecode(aws_lambda_function.bridge[0].environment[0].variables.VRDEX_EVENT_MEDIA_SECRET_REF_MAP_JSON)) == var.event_media_bridge.credential_refs && aws_lambda_function.bridge[0].environment[0].variables.VRDEX_EVENT_MEDIA_WORKER_TOKEN_SECRET_ARN == var.event_media_bridge.token_secret_arn
    error_message = "Adding the managed namespace must preserve the exact existing credential and worker-token bindings."
  }
}
run "bridge_without_managed_prefix" {
  command = plan
  variables { enable_event_media_bridge = true }
  assert {
    condition     = !contains(keys(aws_lambda_function.bridge[0].environment[0].variables), "VRDEX_EVENT_OUTPUT_SECRET_ARN_PREFIX")
    error_message = "A disabled managed namespace must omit its dispatcher prefix."
  }
}
