-- Migration 0028: Add promessa_pagamento_data to conversation_state
ALTER TABLE conversation_state ADD COLUMN promessa_pagamento_data TEXT DEFAULT NULL;
