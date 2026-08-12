DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE phone = '5511999998888'));
DELETE FROM conversation_state WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE phone = '5511999998888'));
DELETE FROM scheduled_followups WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE phone = '5511999998888'));
DELETE FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE phone = '5511999998888');
DELETE FROM contacts WHERE phone = '5511999998888';
DELETE FROM automation_leads WHERE phone = '5511999998888';
