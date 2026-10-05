# Architecture rules


- Elevadores cronograma: Project → Stages → Activities → Units; dates/status/responsible live on the activity, units are only linked (elev_cronograma_execucoes is the activity↔unit link reusing etapa_unidades, which the Kanban depends on); stage period/status are always derived from activities — keeps one source of truth.
- Elevadores inventory: Unidade → elev_elevadores → elev_faciais (one facial belongs to at most one elevator, an elevator may have many faciais); units come from the central unidades/elev_lojas registry, never duplicated in the cronograma; validation and situation are derived, never stored.
- Holidays/ponto facultativo are computed client-side in cronogramaModel (Easter-based) and only flag dates, never move them.
- Cronograma Gantt is a read-only view of existing activities with derived stage summaries; it shares cronogramaModel dates/status and never persists a separate timeline — prevents divergent scheduling data.
- Gantt timeline rows have isolated stacking contexts below sticky labels and headers — bars must never overlap the fixed name column during scrolling.
- Stage colors persist as semantic palette keys and resolve through shared CSS tokens in calendar and Gantt; status remains separate text — keeps stage identity consistent across views and themes.
