# Architecture rules

- The GoodStorage elevator schedule evolves inside the existing Elevadores module and uses the configurable hierarchy Project → Stages → Stores → Facials; ordering is visual and dependencies are always optional.- Elevadores: physical inventory (Unidade → elev_elevadores → elev_faciais) is separate from the cronograma (Projeto → Etapas → Unidades → elev_cronograma_faciais, optionally linked via facial_id); validation lives on elev_elevadores and overall situation is derived, never stored — keeps "not verified" distinct from "verified absent".
