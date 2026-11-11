mock_provider "posthog" {}

run "production_full_reports" {
  command = plan

  assert {
    condition = alltrue([
      for insight in [
        posthog_insight.auth_restore_outcomes,
        posthog_insight.auth_restore_latency,
        posthog_insight.auth_restore_slow,
        posthog_insight.auth_state_change_intent,
        posthog_insight.auth_restore_by_deployment,
        posthog_insight.auth_restore_by_browser,
        posthog_insight.claim_terminal_outcomes,
        ] : alltrue([
          for filter in local.production_full_properties : contains(jsondecode(insight.query_json).source.properties, filter)
      ])
    ])
    error_message = "Every existing trend must exclude nonproduction and non-Full events."
  }

  assert {
    condition = alltrue([
      strcontains(jsondecode(posthog_insight.claim_journey_funnel.query_json).source.query, "properties.deployment_category = 'production'"),
      strcontains(jsondecode(posthog_insight.claim_journey_funnel.query_json).source.query, "properties.analytics_mode = 'full'"),
      strcontains(jsondecode(posthog_insight.claim_journey_funnel.query_json).source.query, "GROUP BY journey_id"),
    ])
    error_message = "Milestone reach must filter at ingestion cohort and join by journey, not account."
  }
}
