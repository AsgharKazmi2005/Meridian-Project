"use client";
import { useMemo, useState } from "react";
import data from "../csp_toy_instance.json";
import AlgorithmSimulation from "./AlgorithmSimulation";
type Site = {
  id: string;
  name: string;
  specialties: string[];
  capacity_per_block: number;
  requires_prerequisite: string | null;
  min_licensure_hours: number;
};
type Student = {
  id: string;
  name: string;
  track: string;
  required_specialties: string[];
  licensure_hours: number;
  completed_prerequisites: string[];
};
type Instance = {
  id: string;
  sites: Site[];
  students: Student[];
  travel_minutes: Record<string, Record<string, number>>;
};
type Plan = {
  student: string;
  block_1: { site: string; specialty: string };
  block_2: { site: string; specialty: string };
  travel: number;
};
type Reject = {
  student: string;
  attempt: string;
  reason: string;
  rule: string;
};
const primary = data.instances.find(
  (i) => i.id === "C2-primary",
) as unknown as Instance;
const infeasible = data.instances.find(
  (i) => i.id === "C2-infeasible",
) as unknown as Instance;
const pretty = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
function domains(
  ins: Instance,
  limit: number,
  log: Reject[],
  stats: { rejected: number; counts: Record<string, number> },
) {
  const out: Record<string, Plan[]> = {};
  for (const st of ins.students) {
    out[st.id] = [];
    for (const order of [
      st.required_specialties,
      [...st.required_specialties].reverse(),
    ])
      for (const a of ins.sites)
        for (const b of ins.sites) {
          const attempt = `${a.name} to ${b.name}`,
            fail = (reason: string, rule: string) => {
              stats.rejected++;
              stats.counts[rule] = (stats.counts[rule] || 0) + 1;
              if (log.length < 240)
                log.push({ student: st.id, attempt, reason, rule });
            };
          if (a.id === b.id) {
            fail(
              "The same site was selected for both blocks.",
              "No repeated site",
            );
            continue;
          }
          if (
            !a.specialties.includes(order[0]) ||
            !b.specialties.includes(order[1])
          ) {
            fail(
              "One or both sites do not offer the required specialty.",
              "Specialty coverage",
            );
            continue;
          }
          const pre = [a, b].find(
            (s) =>
              s.requires_prerequisite &&
              !st.completed_prerequisites.includes(s.requires_prerequisite),
          );
          if (pre) {
            fail(
              `${pre.name} requires ${pre.requires_prerequisite}.`,
              "Prerequisite",
            );
            continue;
          }
          const hrs = [a, b].find(
            (s) => st.licensure_hours < s.min_licensure_hours,
          );
          if (hrs) {
            fail(
              `${st.licensure_hours} hours is below ${hrs.min_licensure_hours} required at ${hrs.name}.`,
              "Licensure hours",
            );
            continue;
          }
          const over = [a, b].find(
            (s) => ins.travel_minutes[st.id][s.id] > limit,
          );
          if (over) {
            fail(
              `${ins.travel_minutes[st.id][over.id]} minutes exceeds the ${limit}-minute limit.`,
              "Travel limit",
            );
            continue;
          }
          const p = {
            student: st.id,
            block_1: { site: a.id, specialty: order[0] },
            block_2: { site: b.id, specialty: order[1] },
            travel:
              ins.travel_minutes[st.id][a.id] + ins.travel_minutes[st.id][b.id],
          };
          if (
            !out[st.id].some(
              (x) =>
                JSON.stringify([x.block_1, x.block_2]) ===
                JSON.stringify([p.block_1, p.block_2]),
            )
          )
            out[st.id].push(p);
        }
  }
  return out;
}
function solve(ins: Instance, limit: number, obj: string) {
  const rejected: Reject[] = [],
    stats = { rejected: 0, counts: {} as Record<string, number> },
    plans = domains(ins, limit, rejected, stats),
    students = [...ins.students].sort(
      (a, b) => plans[a.id].length - plans[b.id].length,
    ),
    valid: Plan[][] = [];
  let best: Plan[] | null = null,
    bestScore = Infinity,
    explored = 0;
  const occ: Record<string, number> = {},
    chosen: Plan[] = [];
  const score = (x: Plan[]) =>
    obj === "total"
      ? x.reduce((n, p) => n + p.travel, 0)
      : Math.max(...x.map((p) => p.travel));
  const search = (i: number) => {
    if (explored > 250000) return;
    if (i === students.length) {
      explored++;
      if (valid.length < 20) valid.push([...chosen]);
      const s = score(chosen);
      if (s < bestScore) {
        bestScore = s;
        best = [...chosen];
      }
      return;
    }
    for (const p of plans[students[i].id]) {
      const keys = [`block_1|${p.block_1.site}`, `block_2|${p.block_2.site}`],
        over = keys.find(
          (k, n) =>
            (occ[k] || 0) >=
            ins.sites.find(
              (s) => s.id === (n ? p.block_2.site : p.block_1.site),
            )!.capacity_per_block,
        );
      if (over) {
        stats.rejected++;
        stats.counts["Site capacity"] =
          (stats.counts["Site capacity"] || 0) + 1;
        if (rejected.length < 260)
          rejected.push({
            student: p.student,
            attempt: `${pretty(p.block_1.site)} to ${pretty(p.block_2.site)}`,
            reason: `This plan would exceed ${pretty(over.split("|")[1])}'s block capacity.`,
            rule: "Site capacity",
          });
        continue;
      }
      keys.forEach((k) => (occ[k] = (occ[k] || 0) + 1));
      chosen.push(p);
      search(i + 1);
      chosen.pop();
      keys.forEach((k) => occ[k]--);
    }
  };
  search(0);
  const assignment = best as Plan[] | null;
  return {
    assignment,
    valid,
    total: assignment?.reduce((n, p) => n + p.travel, 0) || 0,
    worst: assignment ? Math.max(...assignment.map((p) => p.travel)) : 0,
    rejected,
    rejectedTotal: stats.rejected,
    rejectionCounts: stats.counts,
    explored,
    domainSize: Object.values(plans).reduce((n, p) => n + p.length, 0),
  };
}
function Schedule({ plans, ins }: { plans: Plan[]; ins: Instance }) {
  const name = (id: string) => ins.sites.find((s) => s.id === id)?.name || id;
  return (
    <div className="schedule">
      <div className="table-head">
        <span>Student</span>
        <span>Block 1</span>
        <span>Block 2</span>
        <span>Travel</span>
      </div>
      {[...plans]
        .sort((a, b) => a.student.localeCompare(b.student))
        .map((p) => (
          <div className="row" key={p.student}>
            <span>
              <b>{p.student.toUpperCase()}</b>
              <small>
                {ins.students.find((s) => s.id === p.student)?.name}
              </small>
            </span>
            <span>
              <b>{name(p.block_1.site)}</b>
              <small>{pretty(p.block_1.specialty)}</small>
            </span>
            <span>
              <b>{name(p.block_2.site)}</b>
              <small>{pretty(p.block_2.specialty)}</small>
            </span>
            <span className="minutes">{p.travel} min</span>
          </div>
        ))}
    </div>
  );
}
const ruleInfo: Record<string, { notation: string; description: string }> = {
  "Specialty coverage": {
    notation: "{r_i1, r_i2} = R_i; r_ib in S_xib",
    description:
      "Both required specialties must be completed at sites that offer them.",
  },
  "No repeated site": {
    notation: "x_i1 != x_i2",
    description: "A student cannot attend the same site in both blocks.",
  },
  Prerequisite: {
    notation: "q_j = empty or q_j in Q_i",
    description:
      "The student must have completed any prerequisite required by the site.",
  },
  "Licensure hours": {
    notation: "h_i >= m_j",
    description: "The student's hours must meet the site's minimum.",
  },
  "Travel limit": {
    notation: "d_ij <= L",
    description: "Each individual placement must stay within the travel limit.",
  },
  "Site capacity": {
    notation: "sum(i,p) a_ipbj y_ip <= c_j",
    description:
      "The number assigned to a site in a block cannot exceed its capacity.",
  },
};
const chartColors = [
  "#315f55",
  "#d49d42",
  "#9d5d4f",
  "#6e7890",
  "#7e9b73",
  "#b77d55",
];
function RejectionChart({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]),
    total = entries.reduce((n, [, v]) => n + v, 0);
  let cursor = 0;
  const stops = entries
    .map(([, value], i) => {
      const start = cursor;
      cursor += (value / total) * 100;
      return `${chartColors[i % chartColors.length]} ${start}% ${cursor}%`;
    })
    .join(",");
  return (
    <section className="rejection-chart">
      <div className="pie-wrap">
        <div
          className="pie"
          style={{ background: `conic-gradient(${stops})` }}
          role="img"
          aria-label={`Pie chart of ${total} rejected decisions grouped by violated constraint`}
        >
          <div>
            <b>{total.toLocaleString()}</b>
            <span>
              rejected
              <br />
              decisions
            </span>
          </div>
        </div>
      </div>
      <div className="chart-legend">
        {entries.map(([rule, count], i) => (
          <div className="legend-row" key={rule}>
            <i style={{ background: chartColors[i % chartColors.length] }} />
            <div>
              <b>{rule}</b>
              <code>{ruleInfo[rule]?.notation}</code>
              <p>{ruleInfo[rule]?.description}</p>
            </div>
            <strong>
              {count.toLocaleString()}
              <small>{((count / total) * 100).toFixed(1)}%</small>
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}
export default function Home() {
  const [scenario, setScenario] = useState("C2-primary"),
    [travel, setTravel] = useState(45),
    [capacity, setCapacity] = useState(3),
    [objective, setObjective] = useState("fairness"),
    [result, setResult] = useState<ReturnType<typeof solve> | null>(null),
    [tab, setTab] = useState<"optimized" | "valid" | "invalid">("optimized"),
    [validIndex, setValidIndex] = useState(0),
    [running, setRunning] = useState(false),
    [hovered, setHovered] = useState<string | null>(null),
    [environmentView, setEnvironmentView] = useState<
      "formulation" | "simulation"
    >("formulation"),
    [notationMode, setNotationMode] = useState<"human" | "formal">("human");
  const ins = useMemo(() => {
    const x = structuredClone(scenario === "C2-primary" ? primary : infeasible);
    x.sites.find((s) => s.id === "st_augustine")!.capacity_per_block = capacity;
    return x;
  }, [scenario, capacity]);
  const run = () => {
      setRunning(true);
      setResult(null);
      setTimeout(() => {
        setResult(solve(ins, travel, objective));
        setRunning(false);
      }, 350);
    },
    reason =
      travel < 45
        ? `The ${travel}-minute travel limit removes too many eligible placements for all 12 students to be scheduled.`
        : capacity < 3
          ? `St. Augustine has only ${capacity} seats per block, which creates a capacity bottleneck after all eligibility rules are applied.`
          : "The selected combination of hard constraints leaves no complete two-block schedule.";
  return (
    <main>
      <header className="course-head">
        <div>
          <b>SP-2</b>
          <span>CSP Formulation and Solve for a Toy C2 Instance</span>
        </div>
        <dl>
          <div>
            <dt>Professor</dt>
            <dd>Mihir Matalia</dd>
          </div>
          <div>
            <dt>Team</dt>
            <dd>
              Anoop - Owner / Leader
              <br />
              Asghar - Reviewer
              <br />
              Delren
            </dd>
          </div>
        </dl>
      </header>
      <section className="problem">
        <p className="eyebrow">PROBLEM DESCRIPTION</p>
        <h1>Clinical placement scheduling</h1>
        <p>
          Assign each of 12 students to one clinical site in each of two
          rotation blocks. Every assignment must satisfy specialty coverage,
          different-site, capacity, prerequisite, licensure-hour, and travel
          constraints. After finding legal schedules, optimize either fairness
          or total travel.
        </p>
        <div className="facts">
          <span>
            <b>12</b> students
          </span>
          <span>
            <b>4</b> sites
          </span>
          <span>
            <b>2</b> blocks
          </span>
          <span>
            <b>6</b> hard constraints
          </span>
        </div>
      </section>
      <section className="workspace">
        <div className="section-head">
          <div>
            <span>01</span>
            <div>
              <h2>Simulation environment</h2>
              <p>
                {environmentView === "formulation"
                  ? "Hover over any rule to see its matching formal constraint."
                  : "Step through the notebook’s MILP formulation and two-stage solve."}
              </p>
            </div>
          </div>
        </div>
        <div className="environment-tabs">
          <button
            className={environmentView === "formulation" ? "active" : ""}
            onClick={() => setEnvironmentView("formulation")}
          >
            CSP formulation
          </button>
          <button
            className={environmentView === "simulation" ? "active" : ""}
            onClick={() => setEnvironmentView("simulation")}
          >
            Algorithm simulation
          </button>
        </div>
        {environmentView === "formulation" ? (
          <div className="define-grid">
            <div className="card natural">
              <div className="card-title">
                <h3>Constraints in plain language</h3>
              </div>
              <label
                onMouseEnter={() => setHovered("scenario")}
                onMouseLeave={() => setHovered(null)}
              >
                Scenario
                <select
                  value={scenario}
                  onChange={(e) => {
                    setScenario(e.target.value);
                    setCapacity(e.target.value === "C2-infeasible" ? 2 : 3);
                    setResult(null);
                  }}
                >
                  <option value="C2-primary">C2 Primary - feasible</option>
                  <option value="C2-infeasible">
                    C2 Infeasible - capacity loss
                  </option>
                </select>
              </label>
              <div className="rule-list">
                <div
                  onMouseEnter={() => setHovered("one")}
                  onMouseLeave={() => setHovered(null)}
                >
                  <b>Exactly one plan</b>
                  <span>
                    Every student receives one complete two-block plan.
                  </span>
                </div>
                <div
                  onMouseEnter={() => setHovered("specialty")}
                  onMouseLeave={() => setHovered(null)}
                >
                  <b>Specialty coverage</b>
                  <span>
                    Both required specialties are completed, one per block, at a
                    site that offers them.
                  </span>
                </div>
                <div
                  onMouseEnter={() => setHovered("repeat")}
                  onMouseLeave={() => setHovered(null)}
                >
                  <b>Different sites</b>
                  <span>
                    A student cannot attend the same site in both blocks.
                  </span>
                </div>
                <div
                  onMouseEnter={() => setHovered("capacity")}
                  onMouseLeave={() => setHovered(null)}
                >
                  <b>Site capacity</b>
                  <span>
                    St. Augustine can accept{" "}
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={capacity}
                      onChange={(e) => {
                        setCapacity(+e.target.value);
                        setResult(null);
                      }}
                    />{" "}
                    students per block.
                  </span>
                </div>
                <div
                  onMouseEnter={() => setHovered("prereq")}
                  onMouseLeave={() => setHovered(null)}
                >
                  <b>Prerequisites</b>
                  <span>
                    A student must have completed any course required by a site.
                  </span>
                </div>
                <div
                  onMouseEnter={() => setHovered("hours")}
                  onMouseLeave={() => setHovered(null)}
                >
                  <b>Licensure hours</b>
                  <span>A student's hours must meet the site's minimum.</span>
                </div>
                <div
                  onMouseEnter={() => setHovered("travel")}
                  onMouseLeave={() => setHovered(null)}
                >
                  <b>Travel limit</b>
                  <span>
                    No placement may exceed{" "}
                    <input
                      type="number"
                      min="10"
                      max="90"
                      value={travel}
                      onChange={(e) => {
                        setTravel(+e.target.value);
                        setResult(null);
                      }}
                    />{" "}
                    minutes.
                  </span>
                </div>
              </div>
            </div>
            <div className="card notation">
              <div className="card-title">
                <h3>CSP notation</h3>
                <div
                  className="notation-toggle"
                  role="group"
                  aria-label="Notation style"
                >
                  <button
                    className={notationMode === "human" ? "active" : ""}
                    aria-pressed={notationMode === "human"}
                    onClick={() => setNotationMode("human")}
                  >
                    Human readable
                  </button>
                  <button
                    className={notationMode === "formal" ? "active" : ""}
                    aria-pressed={notationMode === "formal"}
                    onClick={() => setNotationMode("formal")}
                  >
                    Formal
                  </button>
                </div>
              </div>
              {notationMode === "human" ? (
                <>
                  <div
                    className={`formula ${hovered === "scenario" ? "matched" : ""}`}
                  >
                    <small>MODEL</small>
                    <code>CSP = (variables, domains, constraints)</code>
                  </div>
                  <div className="formula">
                    <small>VARIABLES AND DOMAINS</small>
                    <code>
                      assign<sub>student, plan</sub> ∈ &#123;0, 1&#125;
                    </code>
                    <code>
                      plans<sub>student</sub> = eligible two-block plans
                    </code>
                  </div>
                  <div className="formula constraints">
                    <small>HARD CONSTRAINTS</small>
                    <code className={hovered === "one" ? "matched" : ""}>
                      ∑<sub>plan in plans(student)</sub> assign
                      <sub>student, plan</sub> = 1
                    </code>
                    <code className={hovered === "specialty" ? "matched" : ""}>
                      &#123;specialty<sub>student, block 1</sub>, specialty
                      <sub>student, block 2</sub>&#125; = required
                      <sub>student</sub>
                    </code>
                    <code className={hovered === "repeat" ? "matched" : ""}>
                      site<sub>student, block 1</sub> ≠ site
                      <sub>student, block 2</sub>
                    </code>
                    <code className={hovered === "capacity" ? "matched" : ""}>
                      ∑<sub>student, plan</sub> uses
                      <sub>student, plan, block, site</sub> assign
                      <sub>student, plan</sub> ≤ capacity<sub>site</sub>{" "}
                      (capacity<sub>St. Augustine</sub> = {capacity})
                    </code>
                    <code className={hovered === "prereq" ? "matched" : ""}>
                      prerequisite<sub>site</sub> = none or prerequisite
                      <sub>site</sub> ∈ completed<sub>student</sub>
                    </code>
                    <code className={hovered === "hours" ? "matched" : ""}>
                      hours<sub>student</sub> ≥ minimum<sub>site</sub>
                    </code>
                    <code className={hovered === "travel" ? "matched" : ""}>
                      travel<sub>student, site</sub> ≤ limit (limit = {travel})
                    </code>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className={`formula ${hovered === "scenario" ? "matched" : ""}`}
                  >
                    <small>MODEL</small>
                    <code>CSP = (X, D, C)</code>
                  </div>
                  <div className="formula">
                    <small>VARIABLES AND DOMAINS</small>
                    <code>
                      X = &#123; y<sub>ip</sub> | i in I, p in P<sub>i</sub>{" "}
                      &#125;
                    </code>
                    <code>
                      D(y<sub>ip</sub>) = &#123;0, 1&#125;
                    </code>
                  </div>
                  <div className="formula constraints">
                    <small>HARD CONSTRAINTS</small>
                    <code className={hovered === "one" ? "matched" : ""}>
                      ∑<sub>p ∈ Pᵢ</sub> y<sub>ip</sub> = 1
                    </code>
                    <code className={hovered === "specialty" ? "matched" : ""}>
                      &#123;r<sub>i1</sub>, r<sub>i2</sub>&#125; = R<sub>i</sub>
                      , r<sub>ib</sub> ∈ S<sub>xib</sub>
                    </code>
                    <code className={hovered === "repeat" ? "matched" : ""}>
                      x<sub>i1</sub> ≠ x<sub>i2</sub>
                    </code>
                    <code className={hovered === "capacity" ? "matched" : ""}>
                      ∑<sub>i,p</sub> a<sub>ipbj</sub>y<sub>ip</sub> ≤ c
                      <sub>j</sub> (c<sub>StA</sub> = {capacity})
                    </code>
                    <code className={hovered === "prereq" ? "matched" : ""}>
                      q<sub>j</sub> = ∅ or q<sub>j</sub> ∈ Q<sub>i</sub>
                    </code>
                    <code className={hovered === "hours" ? "matched" : ""}>
                      h<sub>i</sub> ≥ m<sub>j</sub>
                    </code>
                    <code className={hovered === "travel" ? "matched" : ""}>
                      d<sub>ij</sub> ≤ L (L = {travel})
                    </code>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <AlgorithmSimulation instance={ins} travelLimit={travel} />
        )}
      </section>
      <section className="optimize">
        <div className="section-head">
          <div>
            <span>02</span>
            <div>
              <h2>Optimization objective</h2>
              <p>
                The objective ranks legal schedules; it is separate from the
                hard constraints.
              </p>
            </div>
          </div>
        </div>
        <div className="choice-grid">
          <button
            className={objective === "fairness" ? "choice selected" : "choice"}
            onClick={() => {
              setObjective("fairness");
              setResult(null);
            }}
          >
            <span className="radio" />
            <small>EGALITARIAN</small>
            <h3>Minimize worst travel</h3>
            <p>
              Minimize the longest combined commute assigned to any one student.
            </p>
            <code>min max travel(i)</code>
          </button>
          <button
            className={objective === "total" ? "choice selected" : "choice"}
            onClick={() => {
              setObjective("total");
              setResult(null);
            }}
          >
            <span className="radio" />
            <small>UTILITARIAN</small>
            <h3>Minimize total travel</h3>
            <p>Minimize combined travel time across the entire cohort.</p>
            <code>min sum travel(i)</code>
          </button>
        </div>
      </section>
      <section className="run-zone">
        <button className="run" onClick={run} disabled={running}>
          {running ? "Evaluating configurations..." : "Run simulation"}
        </button>
        <p>
          Domain filtering - capacity search - objective scoring - verification
        </p>
      </section>
      <section className="results">
        <div className="section-head">
          <div>
            <span>03</span>
            <div>
              <h2>Simulation results</h2>
              <p>
                Eligible plans are individual student options; valid
                configurations are complete 12-student schedules.
              </p>
            </div>
          </div>
        </div>
        {!result && !running && (
          <div className="empty">
            <h3>No results yet</h3>
            <p>Set the constraints and objective, then run the simulation.</p>
          </div>
        )}
        {running && (
          <div className="empty">
            <h3>Evaluating candidate plans</h3>
          </div>
        )}
        {result && (
          <>
            <div className="metrics">
              <div>
                <small>ELIGIBLE STUDENT PLANS</small>
                <b>{result.domainSize}</b>
                <span>individual two-block options</span>
              </div>
              <div>
                <small>VALID FULL SCHEDULES</small>
                <b>{result.explored}</b>
                <span>12-student configurations</span>
              </div>
              <div>
                <small>WORST TRAVEL</small>
                <b>{result.assignment ? `${result.worst}m` : "-"}</b>
                <span>fairness score</span>
              </div>
              <div>
                <small>TOTAL TRAVEL</small>
                <b>{result.assignment ? `${result.total}m` : "-"}</b>
                <span>optimized schedule</span>
              </div>
            </div>
            <div className="tabs">
              <button
                className={tab === "optimized" ? "active" : ""}
                onClick={() => setTab("optimized")}
              >
                Optimized configuration
              </button>
              <button
                className={tab === "valid" ? "active" : ""}
                onClick={() => setTab("valid")}
              >
                Valid configurations <span>{result.explored}</span>
              </button>
              <button
                className={tab === "invalid" ? "active" : ""}
                onClick={() => setTab("invalid")}
              >
                Invalid configurations <span>{result.rejectedTotal}</span>
              </button>
            </div>
            {tab === "optimized" &&
              (result.assignment ? (
                <Schedule plans={result.assignment} ins={ins} />
              ) : (
                <div className="infeasible">
                  <b>INFEASIBLE RESULT</b>
                  <h3>No assignment satisfies every hard constraint.</h3>
                  <p>{reason}</p>
                  <div className="fixes">
                    {travel < 45 && (
                      <button
                        onClick={() => {
                          setTravel(45);
                          setResult(null);
                        }}
                      >
                        Reset travel limit to 45
                      </button>
                    )}
                    {capacity < 3 && (
                      <button
                        onClick={() => {
                          setCapacity(3);
                          setResult(null);
                        }}
                      >
                        Restore capacity to 3
                      </button>
                    )}
                  </div>
                </div>
              ))}
            {tab === "valid" &&
              (result.valid.length ? (
                <div className="valid-panel">
                  <label>
                    Showing saved examples
                    <select
                      value={validIndex}
                      onChange={(e) => setValidIndex(+e.target.value)}
                    >
                      {result.valid.map((_, i) => (
                        <option key={i} value={i}>
                          Valid configuration {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="tab-note">
                    The search counted {result.explored} valid full schedules.
                    The dropdown keeps the first {result.valid.length} examples
                    for inspection.
                  </p>
                  <Schedule
                    plans={
                      result.valid[
                        Math.min(validIndex, result.valid.length - 1)
                      ]
                    }
                    ins={ins}
                  />
                </div>
              ) : (
                <div className="empty">
                  <h3>No valid configurations</h3>
                </div>
              ))}
            {tab === "invalid" && (
              <div>
                <RejectionChart counts={result.rejectionCounts} />
                <p className="tab-note">
                  The chart groups every rejected decision by its first violated
                  constraint. These are decision-level rejections, not complete
                  12-student schedules; the first{" "}
                  {Math.min(30, result.rejected.length)} examples are shown
                  below.
                </p>
                <div className="rejects">
                  {result.rejected.slice(0, 30).map((r, i) => (
                    <div className="reject" key={i}>
                      <span className="x">x</span>
                      <div>
                        <small>
                          {r.student.toUpperCase()} - {r.attempt}
                        </small>
                        <b>{r.rule}</b>
                        <p>{r.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
      <footer>
        <p>
          <b>SP-2 - CSCI 410 / CSCI 755 Artificial Intelligence</b>
          <br />
          Synthetic student data used for instructional purposes.
        </p>
      </footer>
    </main>
  );
}
