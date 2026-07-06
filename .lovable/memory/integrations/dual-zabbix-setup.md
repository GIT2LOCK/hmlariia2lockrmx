---
name: Dual Zabbix Integration
description: Two Zabbix instances (Brava=z1, 2lock=z2) merged into single dashboard with source-specific filters
type: feature
---
- Zabbix 1 (Brava): ZABBIX_API_URL + ZABBIX_API_TOKEN. Filter: "Indisponibilidade" triggers, exclude "Infraestrutura" group.
- Zabbix 2 (2lock): ZABBIX_API_URL_2 + ZABBIX_API_TOKEN_2. Filter: "Indisponibilidade de CTRL" → equipamentos, "Indisponibilidade de DDNS/Link" + "Sem Conexão com a Unidade" → links.
- Problems and maintenances from both instances are merged into a single list.
- Each problem has `source` field ("z1"/"z2") and optional `category` field from backend.
- eventid is prefixed with source to avoid collisions: "z1_84090", "z2_24361".
