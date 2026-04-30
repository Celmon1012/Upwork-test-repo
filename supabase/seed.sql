-- =============================================================================
-- Seed: oral questions + rubrics (from app prototype)
-- Source: former prototype copy + rubrics; `evaluation` JSON matches EvaluationBlock in the app.
--
-- Run in Supabase SQL Editor AFTER 00000000000000_mvp_core_schema.sql
-- Use the default postgres / Dashboard SQL (bypasses RLS).
-- Safe to re-run: replaces questions + rubrics under set slug mvp-orals-v1.
-- =============================================================================

begin;

insert into public.question_sets (slug, title, description, is_active, version)
values (
  'mvp-orals-v1',
  'MVP oral scenarios',
  'Seeded oral catalog for the Next.js practice flow',
  true,
  1
)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  is_active = excluded.is_active,
  updated_at = now();

delete from public.rubrics
where question_id in (
  select q.id
  from public.questions q
  join public.question_sets qs on qs.id = q.question_set_id
  where qs.slug = 'mvp-orals-v1'
);

delete from public.questions
where question_set_id = (select id from public.question_sets where slug = 'mvp-orals-v1');

insert into public.questions (
  question_set_id,
  slug,
  context_label,
  prompt_line,
  scenario,
  sample_answer,
  order_index,
  status,
  version
)
select
  qs.id,
  v.slug,
  v.context_label,
  v.prompt_line,
  v.scenario,
  v.sample_answer,
  v.order_index,
  'published',
  1
from public.question_sets qs
cross join lateral (
  values
    (
      'lost-comms-vfr',
      'Lost communications',
      $$You've lost two-way radio communication in VFR conditions. What do you do, and in what order?$$,
      $$Class E surface area, you're VFR, flight following dropped out after your last acknowledgment. You're not IFR.$$,
      jsonb_build_array(
        'Squawk 7600.',
        'Continue VFR — proceed to the nearest suitable airport.',
        'Fly the 91.185 route stack: assigned route first, then expected, then filed.',
        'Altitude: fly the highest of assigned, MEA, or expected.'
      ),
      0
    ),
    (
      'weather-briefing-go-no-go',
      'Weather briefing',
      $$Before departure, how do you brief weather and make a go/no-go decision?$$,
      $$Cross-country in a normally aspirated single. Ceiling and visibility are trending down along the route.$$,
      jsonb_build_array(
        'Start with METARs, TAFs, radar, and winds aloft for departure, en route, and destination.',
        'Identify ceilings, visibility, convection, icing, and wind risk against personal minimums.',
        'Set clear divert points and alternates before takeoff.',
        'If trends or margins are not acceptable, no-go is the correct decision.'
      ),
      1
    ),
    (
      'notams-and-airspace-brief',
      'NOTAMs and airspace',
      $$Walk me through how you'll review NOTAMs and airspace restrictions before this flight.$$,
      $$Planned route crosses multiple controlled segments near a stadium TFR area.$$,
      jsonb_build_array(
        'Review NOTAMs for departure, destination, alternate, and route fixes.',
        'Check for TFRs, runway closures, nav aid outages, and special use airspace status.',
        'Verify route legality through each airspace segment and required communication/equipment.',
        'If a restriction blocks the plan, revise route and brief the new path before departure.'
      ),
      2
    ),
    (
      'runway-performance-assessment',
      'Performance and runway',
      $$How do you determine if the selected runway is suitable for today's takeoff?$$,
      $$High-density-altitude afternoon with a moderate tailwind on the preferred runway.$$,
      jsonb_build_array(
        'Calculate takeoff performance with current weight, pressure altitude, temperature, and wind.',
        'Apply runway surface, slope, and obstacle corrections from the POH data.',
        'Compare required distance with available runway plus a conservative safety margin.',
        'If margin is not acceptable, reduce weight, delay, or choose another runway/airport.'
      ),
      3
    ),
    (
      'weight-balance-fuel-plan',
      'Weight, balance, fuel',
      $$Show me how you verify weight and balance, then fuel planning, before release.$$,
      $$Full passenger load, near max gross, with forecast headwinds stronger than planned.$$,
      jsonb_build_array(
        'Compute weight and CG using actual passenger, baggage, and fuel loads.',
        'Confirm both gross weight and CG remain within envelope for all flight phases.',
        'Plan fuel for taxi, trip, reserve, and realistic headwind/contingency corrections.',
        'If CG, weight, or fuel margins are weak, offload, adjust route, or delay departure.'
      ),
      4
    )
) as v (slug, context_label, prompt_line, scenario, sample_answer, order_index)
where qs.slug = 'mvp-orals-v1';

-- Rubrics: lost-comms-vfr
insert into public.rubrics (question_id, label, keywords, weight, must_have, sort_order, version)
select q.id, r.label, r.keywords, 1, false, r.sort_order, 1
from public.questions q
join public.question_sets qs on qs.id = q.question_set_id
cross join lateral (
  values
    ('7600', '["7600","transponder","squawk"]'::jsonb, 0),
    ('route stack', '["assigned","expected","filed","route"]'::jsonb, 1),
    ('altitude stack', '["mea","minimum","altitude","highest"]'::jsonb, 2),
    ('91.185', '["91.185","regulation","rule"]'::jsonb, 3),
    ('clear order', '["first","then","order","sequence"]'::jsonb, 4)
) as r (label, keywords, sort_order)
where qs.slug = 'mvp-orals-v1' and q.slug = 'lost-comms-vfr';

-- Rubrics: weather-briefing-go-no-go
insert into public.rubrics (question_id, label, keywords, weight, must_have, sort_order, version)
select q.id, r.label, r.keywords, 1, false, r.sort_order, 1
from public.questions q
join public.question_sets qs on qs.id = q.question_set_id
cross join lateral (
  values
    ('weather sources', '["metar","taf","radar","winds aloft"]'::jsonb, 0),
    ('hazard assessment', '["ceiling","visibility","icing","convection","thunderstorm"]'::jsonb, 1),
    ('go/no-go logic', '["go","no-go","decision","personal minimum"]'::jsonb, 2),
    ('alternate plan', '["alternate","divert","plan b"]'::jsonb, 3),
    ('clear sequence', '["first","then","next","sequence"]'::jsonb, 4)
) as r (label, keywords, sort_order)
where qs.slug = 'mvp-orals-v1' and q.slug = 'weather-briefing-go-no-go';

-- Rubrics: notams-and-airspace-brief
insert into public.rubrics (question_id, label, keywords, weight, must_have, sort_order, version)
select q.id, r.label, r.keywords, 1, false, r.sort_order, 1
from public.questions q
join public.question_sets qs on qs.id = q.question_set_id
cross join lateral (
  values
    ('NOTAM coverage', '["notam","departure","destination","alternate"]'::jsonb, 0),
    ('restriction check', '["tfr","closure","outage","restriction"]'::jsonb, 1),
    ('airspace legality', '["airspace","class","legal","clearance"]'::jsonb, 2),
    ('route adjustment', '["reroute","revise","change route","avoid"]'::jsonb, 3),
    ('communication/equipment', '["comms","radio","transponder","equipment"]'::jsonb, 4)
) as r (label, keywords, sort_order)
where qs.slug = 'mvp-orals-v1' and q.slug = 'notams-and-airspace-brief';

-- Rubrics: runway-performance-assessment
insert into public.rubrics (question_id, label, keywords, weight, must_have, sort_order, version)
select q.id, r.label, r.keywords, 1, false, r.sort_order, 1
from public.questions q
join public.question_sets qs on qs.id = q.question_set_id
cross join lateral (
  values
    ('performance inputs', '["weight","altitude","temperature","wind"]'::jsonb, 0),
    ('POH corrections', '["poh","surface","slope","obstacle"]'::jsonb, 1),
    ('distance comparison', '["required distance","available runway","margin"]'::jsonb, 2),
    ('runway suitability decision', '["suitable","unsuitable","accept","reject"]'::jsonb, 3),
    ('mitigation', '["reduce weight","delay","another runway","another airport"]'::jsonb, 4)
) as r (label, keywords, sort_order)
where qs.slug = 'mvp-orals-v1' and q.slug = 'runway-performance-assessment';

-- Rubrics: weight-balance-fuel-plan
insert into public.rubrics (question_id, label, keywords, weight, must_have, sort_order, version)
select q.id, r.label, r.keywords, 1, false, r.sort_order, 1
from public.questions q
join public.question_sets qs on qs.id = q.question_set_id
cross join lateral (
  values
    ('weight and CG', '["weight","cg","center of gravity","envelope"]'::jsonb, 0),
    ('envelope compliance', '["within limits","max gross","limits"]'::jsonb, 1),
    ('fuel components', '["taxi","trip","reserve","contingency"]'::jsonb, 2),
    ('wind adjustment', '["headwind","wind correction","extra fuel"]'::jsonb, 3),
    ('final go/no-go', '["go","no-go","offload","delay"]'::jsonb, 4)
) as r (label, keywords, sort_order)
where qs.slug = 'mvp-orals-v1' and q.slug = 'weight-balance-fuel-plan';

-- Examiner teaching / debrief copy (requires migration 00000000000001_questions_evaluation.sql)
update public.questions q
set evaluation = $ev_lost$
{
  "score": 1,
  "outcomeLabel": "Partial",
  "judgment": "Partial — the sequence isn't there",
  "examinerNote": "I heard pieces of 91.185 in there. But I don't think you could execute this cold on the ramp without me walking you through the order.",
  "correct": [
    "You got to 91.185 — that's your anchor, and you found it.",
    "You mentioned 7600. Fine. That belongs in this conversation."
  ],
  "missed": [
    "But the route priority — assigned, expected, filed — you didn't walk me through that stack in a way I can grade.",
    "Same on altitude. Assigned, MEA, expected, and when you take the highest of them. That never came out as a sequence."
  ],
  "stronger": "Here's what I want. Squawk 7600. Then fly the route under 91.185 in order — assigned, expected, filed — and altitude in the same priority. It should sound like a checklist you've briefed a hundred times, not like you're figuring it out in the chair.",
  "why": "On the ride I'll hand you a lost-comms scenario and just watch what comes out. Partial recall doesn't cut it when the radios go quiet.",
  "deeperExplanation": [
    "91.185 is written as a priority list for a reason. When the radios go quiet, you don't have time to re-derive it — you execute it.",
    "Route priority: assigned, expected, filed. Altitude priority: the highest of assigned, MEA, expected. Memorize the shape, not just the words.",
    "And 7600 first. Before anything else. ATC can't help you if they don't know you're lost."
  ]
}
$ev_lost$::jsonb
from public.question_sets qs
where q.question_set_id = qs.id and qs.slug = 'mvp-orals-v1' and q.slug = 'lost-comms-vfr';

update public.questions q
set evaluation = $ev_weather$
{
  "score": 1,
  "outcomeLabel": "Partial",
  "judgment": "Partial — your weather logic is incomplete",
  "examinerNote": "You gave some weather terms, but your risk decision chain was not clear enough to trust under pressure.",
  "correct": [],
  "missed": [
    "I need a structured weather scan, not just random products.",
    "You must tie weather directly to a go/no-go decision and alternates."
  ],
  "stronger": "Brief weather in sequence: products, hazards, margins, and decision. Then state your go/no-go call clearly.",
  "why": "The checkride is about judgment under uncertainty, not memorizing acronyms.",
  "deeperExplanation": [
    "Always connect data to action. If weather degrades, what exactly changes in your plan?",
    "Personal minimums are only useful if they are explicit before you launch."
  ]
}
$ev_weather$::jsonb
from public.question_sets qs
where q.question_set_id = qs.id and qs.slug = 'mvp-orals-v1' and q.slug = 'weather-briefing-go-no-go';

update public.questions q
set evaluation = $ev_notams$
{
  "score": 1,
  "outcomeLabel": "Partial",
  "judgment": "Partial — restrictions were not fully controlled",
  "examinerNote": "You touched the idea of NOTAMs, but I did not hear a complete legal/operational airspace brief.",
  "correct": [],
  "missed": [
    "NOTAM review must be explicit for all critical airports and route points.",
    "Airspace legality must be confirmed, not assumed."
  ],
  "stronger": "State the NOTAM scan path, identify hard restrictions, and show the legal route decision.",
  "why": "Airspace and NOTAM misses create immediate checkride and operational risk.",
  "deeperExplanation": [
    "Treat TFRs and closures as hard constraints first, then optimize route.",
    "Always verbalize the fallback route if the preferred one closes."
  ]
}
$ev_notams$::jsonb
from public.question_sets qs
where q.question_set_id = qs.id and qs.slug = 'mvp-orals-v1' and q.slug = 'notams-and-airspace-brief';

update public.questions q
set evaluation = $ev_runway$
{
  "score": 1,
  "outcomeLabel": "Partial",
  "judgment": "Partial — performance decision not defensible yet",
  "examinerNote": "You gave general performance language, but I did not hear a concrete accept/reject runway decision method.",
  "correct": [],
  "missed": [
    "I need explicit variables and corrections, not a general statement.",
    "You must state a clear safety margin and reject criteria."
  ],
  "stronger": "Compute, correct, compare, decide — then state your mitigation if margins are weak.",
  "why": "Runway suitability is a hard go/no-go gate, especially in high DA conditions.",
  "deeperExplanation": [
    "Performance math only matters if you use a firm operational margin.",
    "Tailwind and obstacles can erase runway margin quickly."
  ]
}
$ev_runway$::jsonb
from public.question_sets qs
where q.question_set_id = qs.id and qs.slug = 'mvp-orals-v1' and q.slug = 'runway-performance-assessment';

update public.questions q
set evaluation = $ev_wb$
{
  "score": 1,
  "outcomeLabel": "Partial",
  "judgment": "Partial — planning sequence had gaps",
  "examinerNote": "I heard pieces, but not a complete weight/balance plus fuel decision workflow I can sign off on.",
  "correct": [],
  "missed": [
    "You must confirm envelope compliance, not only total weight.",
    "Fuel planning needs explicit reserves and wind-adjusted margins."
  ],
  "stronger": "Run W&B and fuel as a single risk package, then state the accept/reject decision.",
  "why": "This is where planning errors compound into in-flight emergencies.",
  "deeperExplanation": [
    "CG limits are as critical as gross weight for controllability.",
    "Fuel planning must include realistic winds and contingency, not optimistic numbers."
  ]
}
$ev_wb$::jsonb
from public.question_sets qs
where q.question_set_id = qs.id and qs.slug = 'mvp-orals-v1' and q.slug = 'weight-balance-fuel-plan';

commit;
