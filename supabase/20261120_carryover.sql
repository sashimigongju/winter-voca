-- Onlyone vocabulary: carry unfinished study ranges to the next scheduled date.
-- Existing rows remain intact; the target range is expanded, with auditable provenance.
-- Activation: 2026-11-21 Korea Standard Time. No retroactive backlog migration.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS carry_unit_orders integer[] NOT NULL DEFAULT '{}'::integer[];

CREATE TABLE IF NOT EXISTS private.voca_carryover_log(
  source_schedule_id uuid PRIMARY KEY REFERENCES public.schedules(id) ON DELETE CASCADE,
  target_schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  source_units integer[] NOT NULL,
  previous_target_label text NOT NULL,
  applied_target_label text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.voca_carryover_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.apply_voca_carryover(
  p_as_of date DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date,
  p_preview boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  src record;
  dest record;
  src_official text;
  dest_official text;
  combined integer[];
  all_labels text[];
  final_label text;
  all_days boolean;
  total_done integer := 0;
  total_skipped integer := 0;
  preview_rows jsonb := '[]'::jsonb;
BEGIN
  IF p_as_of < DATE '2026-11-21' THEN
    RETURN jsonb_build_object('applied',0,'skipped',0,'message','Automatic carryover is inactive before 2026-11-21 KST');
  END IF;
  -- Prevent two cron workers from processing the same source in parallel.
  PERFORM pg_catalog.pg_advisory_xact_lock(4802621, 20261120);
  FOR src IN
    SELECT s.* FROM public.schedules s
    WHERE s.study_date >= DATE '2026-11-20'
      AND s.study_date < p_as_of
      AND s.is_done = false
      AND s.category_key IS NOT NULL
      AND s.unit_order IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM private.voca_carryover_log l
        WHERE l.source_schedule_id=s.id
      )
    ORDER BY s.study_date,s.created_at,s.id
  LOOP
    SELECT u.label INTO src_official
    FROM public.vocab_units u WHERE u.category_key=src.category_key AND u.unit_order=src.unit_order;
    -- Custom/free-text ranges are never silently reinterpreted as one unit.
    IF src_official IS NULL OR
       (cardinality(src.carry_unit_orders)=0 AND btrim(src.range_label)<>btrim(src_official)) THEN
       total_skipped := total_skipped+1;
       CONTINUE;
    END IF;

    SELECT t.* INTO dest FROM public.schedules t
    WHERE t.student_id=src.student_id
      AND t.category_key=src.category_key
      AND t.study_date > src.study_date
      AND t.study_date >= p_as_of
      AND t.is_done=false
      AND t.id<>src.id
    ORDER BY t.study_date,t.created_at,t.id LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT u.label INTO dest_official
    FROM public.vocab_units u WHERE u.category_key=dest.category_key AND u.unit_order=dest.unit_order;
    IF dest_official IS NULL OR
       (cardinality(dest.carry_unit_orders)=0 AND btrim(dest.range_label)<>btrim(dest_official)) THEN
       total_skipped := total_skipped+1;
       CONTINUE;
    END IF;

    SELECT array_agg(n ORDER BY n) INTO combined
    FROM (SELECT DISTINCT unnest(
      src.carry_unit_orders||ARRAY[src.unit_order]||dest.carry_unit_orders||ARRAY[dest.unit_order]
    ) AS n) distinct_numbers;
    SELECT array_agg(u.label ORDER BY u.unit_order),
           bool_and(u.label ~* '^DAY[[:space:]]*[0-9]+$')
      INTO all_labels,all_days
    FROM public.vocab_units u
    WHERE u.category_key=src.category_key AND u.unit_order=ANY(combined);
    IF cardinality(all_labels)<>cardinality(combined) THEN
      total_skipped:=total_skipped+1;
      CONTINUE;
    END IF;
    IF all_days AND combined[cardinality(combined)]-combined[1]+1=cardinality(combined) THEN
      final_label:='DAY '||pg_catalog.lpad(combined[1]::text,2,'0')||'–'||pg_catalog.lpad(combined[cardinality(combined)]::text,2,'0');
    ELSE
      final_label:=array_to_string(all_labels,', ');
    END IF;
    IF length(final_label)>100 THEN
      total_skipped:=total_skipped+1;
      CONTINUE;
    END IF;

    IF p_preview THEN
      preview_rows:=preview_rows||jsonb_build_array(jsonb_build_object(
        'source',src.id,'target',dest.id,'old',dest.range_label,'new',final_label
      ));
    ELSE
      -- UPDATE checks the current target completion state and retains its original unit_order.
      UPDATE public.schedules t SET
        carry_unit_orders=(SELECT array_agg(n ORDER BY n) FROM unnest(combined) n WHERE n<>dest.unit_order),
        range_label=final_label
      WHERE t.id=dest.id AND t.is_done=false;
      INSERT INTO private.voca_carryover_log(
        source_schedule_id,target_schedule_id,source_units,previous_target_label,applied_target_label
      ) VALUES (
        src.id,dest.id,src.carry_unit_orders||ARRAY[src.unit_order],dest.range_label,final_label
      );
    END IF;
    total_done:=total_done+1;
  END LOOP;
  RETURN jsonb_build_object('applied',total_done,'skipped',total_skipped,'preview',preview_rows);
END
$function$;

REVOKE ALL ON FUNCTION private.apply_voca_carryover(date,boolean) FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION private.apply_voca_carryover(date,boolean) IS
  'Daily idempotent carryover. Cron calls (KST day, false). No history deletion; review private.voca_carryover_log.';
