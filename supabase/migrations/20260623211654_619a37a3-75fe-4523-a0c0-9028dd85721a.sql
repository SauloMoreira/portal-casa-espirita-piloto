DO $$
DECLARE
  v_assistido uuid := 'a1100000-0000-4000-8000-000000000001';
  v_at_cancel uuid := 'a1100000-0000-4000-8000-000000000002';
  v_at_remarc uuid := 'a1100000-0000-4000-8000-000000000003';
  v_ag_cancel uuid := 'a1100000-0000-4000-8000-000000000004';
  v_ag_remarc uuid := 'a1100000-0000-4000-8000-000000000005';
  v_exc_cancel uuid := 'a1100000-0000-4000-8000-00000000000a';
  v_exc_remarc uuid := 'a1100000-0000-4000-8000-00000000000b';
  v_trat_deso uuid := '91dd82e6-b205-4809-95f8-370d3f23f054';
  v_trat_magn uuid := '08a8dbc2-d943-4072-9f05-adfd02fb98fa';
  v_creator uuid := '47762708-951e-439d-b8e6-3c12151c321a';
  r jsonb;
BEGIN
  INSERT INTO assistidos (id, nome, status, created_by, origem_cadastro, celular)
  VALUES (v_assistido, '[HOMOLOGAÇÃO] Caso Teste Exceção', 'ativo', v_creator, 'normal', '21984221866')
  ON CONFLICT (id) DO UPDATE SET celular = EXCLUDED.celular, nome = EXCLUDED.nome;

  INSERT INTO assistido_tratamentos (id, assistido_id, tratamento_id, quantidade_total, status, created_by, data_inicio)
  VALUES
    (v_at_cancel, v_assistido, v_trat_deso, 1, 'em_andamento', v_creator, '2026-06-30'),
    (v_at_remarc, v_assistido, v_trat_magn, 1, 'em_andamento', v_creator, '2026-07-01')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO agenda_tratamentos_assistido (id, assistido_id, assistido_tratamento_id, tratamento_id, data_sessao, horario, status, registrado_por)
  VALUES
    (v_ag_cancel, v_assistido, v_at_cancel, v_trat_deso, '2026-06-30', '19:00', 'agendado', v_creator),
    (v_ag_remarc, v_assistido, v_at_remarc, v_trat_magn, '2026-07-01', '19:00', 'agendado', v_creator)
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'ANTES cancel status=%', (SELECT status FROM agenda_tratamentos_assistido WHERE id = v_ag_cancel);
  RAISE NOTICE 'ANTES remarc data=% horario=%', (SELECT data_sessao FROM agenda_tratamentos_assistido WHERE id = v_ag_remarc), (SELECT horario FROM agenda_tratamentos_assistido WHERE id = v_ag_remarc);

  INSERT INTO excecoes_operacionais (id, tipo, atividade, tratamento_id, data_excecao, horario_afetado, status, prioridade, ativo, motivo, criado_por)
  VALUES (v_exc_cancel, 'tratamento', 'Desobsessão', v_trat_deso, '2026-06-30', '19:00', 'cancelado', 1, true, 'Homologação: cancelamento por exceção', v_creator)
  ON CONFLICT (id) DO NOTHING;

  r := fn_processar_excecao_notificacoes(v_exc_cancel);
  RAISE NOTICE 'RPC cancelamento => %', r;

  INSERT INTO excecoes_operacionais (id, tipo, atividade, tratamento_id, data_excecao, horario_afetado, status, nova_data, novo_horario, prioridade, ativo, motivo, criado_por)
  VALUES (v_exc_remarc, 'tratamento', 'Magnetismo', v_trat_magn, '2026-07-01', '19:00', 'remarcado', '2026-07-08', '20:00', 1, true, 'Homologação: remarcação por exceção', v_creator)
  ON CONFLICT (id) DO NOTHING;

  r := fn_processar_excecao_notificacoes(v_exc_remarc);
  RAISE NOTICE 'RPC remarcacao => %', r;

  RAISE NOTICE 'DEPOIS cancel status=%', (SELECT status FROM agenda_tratamentos_assistido WHERE id = v_ag_cancel);
  RAISE NOTICE 'DEPOIS remarc data=% horario=%', (SELECT data_sessao FROM agenda_tratamentos_assistido WHERE id = v_ag_remarc), (SELECT horario FROM agenda_tratamentos_assistido WHERE id = v_ag_remarc);
END $$;