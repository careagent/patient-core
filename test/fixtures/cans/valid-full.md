---
schema_version: "1.0"
identity_type: patient
consent_posture: deny
health_literacy_level: standard
providers:
  - npi: "1234567890"
    role: primary_care
    trust_level: active
    provider_name: "Dr. Jane Smith"
    organization: "City Medical Group"
    last_changed: "2026-01-15T09:00:00Z"
autonomy:
  share: supervised
  request: supervised
  review: autonomous
communication:
  preferred_language: en
  contact_hours: "09:00-17:00"
advocacy:
  enabled: true
---

# Patient CANS

Full configuration with all optional fields and one provider.
