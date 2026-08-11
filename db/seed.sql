INSERT INTO lists (id, key, name, description, color) VALUES
  ('10000000-0000-4000-8000-000000000001', 'clientes', 'Clientes', 'Personas que ya han comprado', '#315c5b'),
  ('10000000-0000-4000-8000-000000000002', 'newsletter', 'Newsletter', 'Lectores de la newsletter mensual', '#d38464'),
  ('10000000-0000-4000-8000-000000000003', 'equipo', 'Equipo', 'Contactos internos y colaboradores', '#745b9b')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tags (id, name, color) VALUES
  ('20000000-0000-4000-8000-000000000001', 'VIP', '#d09a3c'),
  ('20000000-0000-4000-8000-000000000002', 'Madrid', '#315c5b'),
  ('20000000-0000-4000-8000-000000000003', 'Interés: producto', '#d38464')
ON CONFLICT (id) DO NOTHING;

INSERT INTO contacts (id, email, first_name, last_name, status, source, custom_fields, created_at, last_activity_at) VALUES
  ('30000000-0000-4000-8000-000000000001', 'alba@example.com', 'Alba', 'Romero', 'active', 'csv', '{"country":"España","city":"Madrid"}', now() - interval '4 months', now() - interval '1 day'),
  ('30000000-0000-4000-8000-000000000002', 'marcos@example.com', 'Marcos', 'Vidal', 'active', 'manual', '{"country":"España","city":"Valencia"}', now() - interval '3 months', now() - interval '3 days'),
  ('30000000-0000-4000-8000-000000000003', 'ines@example.com', 'Inés', 'Lara', 'active', 'api', '{"country":"España","city":"Madrid"}', now() - interval '2 months', now() - interval '5 hours'),
  ('30000000-0000-4000-8000-000000000004', 'leo@example.com', 'Leo', 'Martín', 'active', 'csv', '{"country":"España","city":"Barcelona"}', now() - interval '6 weeks', now() - interval '9 days'),
  ('30000000-0000-4000-8000-000000000005', 'sofia@example.com', 'Sofía', 'Nadal', 'active', 'manual', '{"country":"España","city":"Sevilla"}', now() - interval '5 months', now() - interval '2 months'),
  ('30000000-0000-4000-8000-000000000006', 'nuria@example.com', 'Nuria', 'Costa', 'active', 'api', '{"country":"Portugal","city":"Lisboa"}', now() - interval '12 days', now() - interval '2 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO subscriptions (contact_id, list_id, status, source, subscribed_at) VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'active', 'csv', now() - interval '4 months'),
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'active', 'csv', now() - interval '4 months'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'active', 'manual', now() - interval '3 months'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'active', 'api', now() - interval '2 months'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'active', 'api', now() - interval '2 months'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'active', 'csv', now() - interval '6 weeks'),
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'active', 'api', now() - interval '12 days')
ON CONFLICT DO NOTHING;

INSERT INTO contact_tags (contact_id, tag_id) VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000003')
ON CONFLICT DO NOTHING;

INSERT INTO segments (id, name, description, match_type, rules) VALUES
  ('40000000-0000-4000-8000-000000000001', 'Clientes activos', 'Clientes que siguen suscritos', 'all', '[{"field":"status","operator":"is","value":"active"},{"field":"list","operator":"is","value":"10000000-0000-4000-8000-000000000001"}]'),
  ('40000000-0000-4000-8000-000000000002', 'Madrid', 'Contactos ubicados en Madrid', 'all', '[{"field":"city","operator":"is","value":"Madrid"}]')
ON CONFLICT (id) DO NOTHING;

INSERT INTO templates (id, key, channel, format, status, name, subject, preview_text, html_content, text_content) VALUES
  ('50000000-0000-4000-8000-000000000001', 'carta_editorial', 'marketing', 'html', 'published', 'Carta editorial', 'Una nota para {{first_name}}', 'Noticias breves, escritas con calma.', '<div style="max-width:620px;margin:0 auto;font-family:Arial,sans-serif;color:#17282a"><p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#c96d4b">KIROMAIL STUDIO</p><h1 style="font-family:Georgia,serif;font-size:42px;line-height:1.08;font-weight:500">Ideas que merecen<br>un poco de espacio.</h1><p>Hola {{first_name}},</p><p style="font-size:18px;line-height:1.7">Este mes reunimos tres aprendizajes para trabajar mejor, elegir con más intención y dejar sitio a lo importante.</p><p style="margin:32px 0"><a href="https://example.com/leer" style="background:#173f40;color:white;padding:14px 20px;text-decoration:none;border-radius:4px">Leer la edición</a></p><p>Un abrazo,<br>El equipo de KiroMail</p></div>', 'Hola {{first_name}},\n\nEste mes reunimos tres aprendizajes para trabajar mejor.\n\nLeer la edición: https://example.com/leer'),
  ('50000000-0000-4000-8000-000000000002', 'anuncio_producto', 'marketing', 'html', 'published', 'Anuncio de producto', '{{first_name}}, tenemos algo nuevo', 'Una presentación directa y luminosa.', '<div style="max-width:620px;margin:0 auto;font-family:Arial,sans-serif;color:#1f2930"><div style="background:#f0e8dc;padding:48px 42px;border-radius:12px"><p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8b563f">NUEVO LANZAMIENTO</p><h1 style="font-family:Georgia,serif;font-size:40px;font-weight:500">Hecho para avanzar sin ruido.</h1><p style="font-size:18px;line-height:1.65">Hola {{first_name}}, hoy presentamos una forma más sencilla de mantener todo en orden.</p><p style="margin-top:32px"><a href="https://example.com/descubrir" style="color:#173f40;font-weight:bold">Descubrir el producto →</a></p></div></div>', 'Hola {{first_name}},\n\nHoy presentamos una forma más sencilla de mantener todo en orden.\n\nhttps://example.com/descubrir')
ON CONFLICT (id) DO NOTHING;

INSERT INTO template_versions (id, template_id, version_number, status, source_format, subject, preview_text, html_content, text_content, published_at)
SELECT CASE t.id
    WHEN '50000000-0000-4000-8000-000000000001'::uuid THEN '51000000-0000-4000-8000-000000000001'::uuid
    ELSE '51000000-0000-4000-8000-000000000002'::uuid END,
  t.id, 1, 'published', 'html', t.subject, t.preview_text, t.html_content, t.text_content, now()
FROM templates t WHERE t.id IN ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002')
ON CONFLICT (template_id, version_number) DO NOTHING;

UPDATE templates t SET published_version_id = v.id
FROM template_versions v
WHERE v.template_id = t.id AND v.version_number = 1
  AND t.id IN ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002');

INSERT INTO campaigns (id, name, subject, preview_text, from_name, from_email, reply_to, template_id, target_type, target_id, status, scheduled_at, started_at, completed_at, total_recipients, sent_count, delivered_count, open_count, click_count, bounce_count, complaint_count, unsubscribe_count, created_at) VALUES
  ('60000000-0000-4000-8000-000000000001', 'Cuaderno de julio', 'Cinco ideas para un verano más lento', 'Nuestra selección mensual.', 'KiroMail Studio', 'hola@kiromail.local', 'hola@kiromail.local', '50000000-0000-4000-8000-000000000001', 'list', '10000000-0000-4000-8000-000000000002', 'completed', now() - interval '24 days', now() - interval '24 days', now() - interval '24 days' + interval '8 minutes', 1248, 1248, 1219, 718, 164, 29, 1, 6, now() - interval '28 days'),
  ('60000000-0000-4000-8000-000000000002', 'Bienvenida a la temporada', 'Septiembre empieza aquí', 'Una pequeña vuelta a lo esencial.', 'KiroMail Studio', 'hola@kiromail.local', 'hola@kiromail.local', '50000000-0000-4000-8000-000000000002', 'all', NULL, 'scheduled', now() + interval '3 days', NULL, NULL, 0, 0, 0, 0, 0, 0, 0, 0, now() - interval '2 days'),
  ('60000000-0000-4000-8000-000000000003', 'Clientes: avance privado', 'Un vistazo antes que nadie', '', 'KiroMail Studio', 'hola@kiromail.local', 'hola@kiromail.local', '50000000-0000-4000-8000-000000000002', 'segment', '40000000-0000-4000-8000-000000000001', 'draft', NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, 0, 0, now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;

UPDATE campaigns c SET list_id = CASE
    WHEN c.id = '60000000-0000-4000-8000-000000000001'::uuid THEN '10000000-0000-4000-8000-000000000002'::uuid
    WHEN c.id = '60000000-0000-4000-8000-000000000002'::uuid THEN '10000000-0000-4000-8000-000000000002'::uuid
    ELSE '10000000-0000-4000-8000-000000000001'::uuid END,
  template_version_id = t.published_version_id,
  html_content = t.html_content, text_content = t.text_content
FROM templates t WHERE t.id = c.template_id;

INSERT INTO campaign_recipients (id, campaign_id, contact_id, email, status, sent_at, delivered_at, opened_at, clicked_at, open_count, click_count) VALUES
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'alba@example.com', 'delivered', now() - interval '24 days', now() - interval '24 days', now() - interval '23 days 23 hours', now() - interval '23 days 22 hours', 2, 1),
  ('70000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'marcos@example.com', 'delivered', now() - interval '24 days', now() - interval '24 days', now() - interval '23 days 20 hours', NULL, 1, 0),
  ('70000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'ines@example.com', 'delivered', now() - interval '24 days', now() - interval '24 days', NULL, NULL, 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO outbound_messages (
  id, kind, campaign_id, campaign_recipient_id, contact_id, template_version_id,
  to_email, from_email, from_name, reply_to, subject, status, ses_message_id,
  accepted_at, sent_at, delivered_at, first_opened_at, first_clicked_at
)
SELECT ('71000000-0000-4000-8000-00000000000' || right(cr.id::text, 1))::uuid,
  'campaign', cr.campaign_id, cr.id, cr.contact_id, c.template_version_id,
  cr.email, c.from_email, c.from_name, c.reply_to, c.subject, 'delivered', cr.ses_message_id,
  cr.created_at, cr.sent_at, cr.delivered_at, cr.opened_at, cr.clicked_at
FROM campaign_recipients cr JOIN campaigns c ON c.id = cr.campaign_id
WHERE cr.id IN (
  '70000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000003'
)
ON CONFLICT (campaign_recipient_id) DO NOTHING;

UPDATE campaign_recipients cr SET outbound_message_id = om.id
FROM outbound_messages om WHERE om.campaign_recipient_id = cr.id AND cr.outbound_message_id IS NULL;

INSERT INTO consent_events (contact_id, subscription_id, list_id, action, source, occurred_at)
SELECT s.contact_id, s.id, s.list_id, 'subscribed', s.source, COALESCE(s.subscribed_at, s.created_at)
FROM subscriptions s
WHERE s.contact_id IN (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000006'
) AND NOT EXISTS (SELECT 1 FROM consent_events ce WHERE ce.subscription_id = s.id);
