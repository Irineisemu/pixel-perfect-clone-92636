INSERT INTO public.tribunals (alias, name, sphere, status)
VALUES ('api_publica_tjrj', 'Tribunal de Justiça do Rio de Janeiro', 'estadual', 'active')
ON CONFLICT (alias) DO NOTHING;