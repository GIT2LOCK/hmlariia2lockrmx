---
name: Zabbix Integration (2lock only)
description: Single Zabbix instance (2lock=z2). Brava (z1) contract ended, no longer integrated.
type: feature
---
- Zabbix 2lock (z2): ZABBIX_API_URL_2 + ZABBIX_API_TOKEN_2. Filter: "Indisponibilidade de CTRL" → equipamentos, "Indisponibilidade de DDNS/Link" + "Sem Conexão com a Unidade" → links.
- Brava (z1) removed after contract termination — ZABBIX_API_URL/ZABBIX_API_TOKEN still exist as env but are NOT fetched in listing endpoints (problems/maintenance/hosts_all).
- Each problem still carries `source: "z2"` and optional `category` from backend. eventid prefixed as "z2_<id>" to preserve existing per-event routing.
- Frontend labels: no more BRAVA badges; all origem/source displays show "2LOCK".
