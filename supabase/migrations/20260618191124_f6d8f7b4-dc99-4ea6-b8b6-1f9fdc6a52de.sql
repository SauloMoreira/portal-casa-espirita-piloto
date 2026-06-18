CREATE OR REPLACE FUNCTION public.decidir_promocao_admin(
  p_request_id uuid,
  p_decision text,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req admin_promotion_requests%ROWTYPE;
  v_approvals int;
  v_caller uuid := auth.uid();
  v_apt_admins int;
BEGIN
  IF NOT public.is_active_admin(v_caller) THEN
    RETURN jsonb_build_object('error', 'Apenas administradores ativos podem decidir solicitações.');
  END IF;
  IF p_decision NOT IN ('aprovar','rejeitar') THEN
    RETURN jsonb_build_object('error', 'Decisão inválida.');
  END IF;

  SELECT * INTO v_req FROM admin_promotion_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Solicitação não encontrada.');
  END IF;
  IF v_req.status NOT IN ('pendente','aprovado_parcialmente') THEN
    RETURN jsonb_build_object('error', 'Solicitação já finalizada.');
  END IF;

  v_apt_admins := public.count_apt_admins();

  -- Bootstrap exception: when the caller is the SOLE active administrator of the
  -- whole system, the "requester cannot self-approve" rule would create a
  -- permanent deadlock (nobody else exists to approve). In that single-admin
  -- scenario only, the sole administrator may approve their own request.
  IF v_caller = v_req.requested_by AND v_apt_admins > 1 THEN
    RETURN jsonb_build_object('error', 'O solicitante não pode aprovar a própria solicitação.');
  END IF;

  -- The user being promoted can never approve their own promotion (no exception).
  IF v_caller = v_req.target_user_id THEN
    RETURN jsonb_build_object('error', 'O usuário indicado não pode aprovar a própria promoção.');
  END IF;

  -- Exception flow (single master): only an active master may grant the single approval.
  IF v_req.required_approvals = 1 AND p_decision = 'aprovar' AND NOT public.is_active_master(v_caller) THEN
    RETURN jsonb_build_object('error', 'No fluxo excepcional (1 master), somente o Administrador Master pode aprovar.');
  END IF;

  -- Record decision (unique per approver prevents double approval).
  BEGIN
    INSERT INTO admin_promotion_approvals (request_id, approver_id, decision, motivo)
    VALUES (p_request_id, v_caller, p_decision, p_motivo);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'Você já registrou uma decisão para esta solicitação.');
  END;

  IF p_decision = 'rejeitar' THEN
    UPDATE admin_promotion_requests SET status = 'rejeitado', concluido_em = now() WHERE id = p_request_id;
    INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
    VALUES (v_caller, 'admin_promotion_requests', 'PROMOCAO_REJEITADA', p_request_id,
      jsonb_build_object('approver', v_caller, 'motivo', p_motivo));
    RETURN jsonb_build_object('success', true, 'status', 'rejeitado');
  END IF;

  SELECT COUNT(*) INTO v_approvals FROM admin_promotion_approvals
  WHERE request_id = p_request_id AND decision = 'aprovar';

  INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
  VALUES (v_caller, 'admin_promotion_requests', 'PROMOCAO_APROVACAO_REGISTRADA', p_request_id,
    jsonb_build_object('approver', v_caller, 'aprovacoes', v_approvals, 'necessarias', v_req.required_approvals,
      'excecao_master', v_req.excecao_master, 'auto_aprovacao_bootstrap', (v_caller = v_req.requested_by), 'motivo', p_motivo));

  IF v_approvals < v_req.required_approvals THEN
    UPDATE admin_promotion_requests SET status = 'aprovado_parcialmente' WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'aprovado_parcialmente', 'aprovacoes', v_approvals, 'necessarias', v_req.required_approvals);
  END IF;

  -- Threshold reached: grant role (and admin if granting master).
  PERFORM set_config('app.allow_admin_grant', 'on', true);
  INSERT INTO user_roles (user_id, role) VALUES (v_req.target_user_id, v_req.target_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  IF v_req.target_role = 'administrador_master' THEN
    INSERT INTO user_roles (user_id, role) VALUES (v_req.target_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  PERFORM set_config('app.allow_admin_grant', 'off', true);

  UPDATE admin_promotion_requests SET status = 'aprovado', concluido_em = now() WHERE id = p_request_id;

  INSERT INTO audit_logs (user_id, tabela, acao, registro_id, dados_novos)
  VALUES (v_caller, 'admin_promotion_requests', 'PROMOCAO_CONCEDIDA', p_request_id,
    jsonb_build_object('target_user_id', v_req.target_user_id, 'target_role', v_req.target_role,
      'excecao_master', v_req.excecao_master, 'aprovacoes', v_approvals, 'auto_aprovacao_bootstrap', (v_caller = v_req.requested_by)));

  RETURN jsonb_build_object('success', true, 'status', 'aprovado');
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_apt_admins() TO authenticated;