// Convert a student's visible plan into printable vocabulary units.
// Parenthesized notes (e.g. "DAY 12(1-50)") are plan-only annotations.
// Prefer the displayed DAY values when metadata and text differ.
const tidy = value => String(value ?? "").replace(/\s+/g, "").toLowerCase();
const dayText = n => "Day " + String(n).padStart(2, "0");

export function parseDisplayedDays(rangeLabel) {
  const text = String(rangeLabel ?? "")
    .replace(/\([^)]*\)/g, "") // conditions are for the study calendar only
    .replace(/\s*복습\s*$/u, "")
    .trim();
  if (!/^DAY\s*0*\d+/i.test(text)) return null;
  let tail = text.replace(/^DAY\s*/i, "").trim();
  const span = tail.match(/^0*(\d{1,3})\s*[-~–]\s*(?:DAY\s*)?0*(\d{1,3})$/i);
  if (span) {
    const a = Number(span[1]), b = Number(span[2]);
    if (a < 1 || b < a || b - a > 364) return null;
    return Array.from({length:b-a+1},(_,i)=>a+i);
  }
  tail = tail.replace(/\bDAY\s*/gi, "").trim();
  if (!/^\d{1,3}(?:[\s,/;+&]+\d{1,3})*$/.test(tail)) return null;
  const values = tail.split(/[\s,/;+&]+/).map(Number);
  return values.every(n => n >= 1 && n <= 365) ? [...new Set(values)] : null;
}

export function getPrintableNames(schedule, units) {
  const bookUnits = units.filter(u => u.category_key === schedule.category_key);
  const byOrder = new Map(bookUnits.map(u=>[Number(u.unit_order), String(u.label)]));
  const original = byOrder.get(Number(schedule.unit_order));
  if (!original) throw new Error("단어장 분류를 찾을 수 없습니다: "+schedule.range_label);

  const visibleDays = parseDisplayedDays(schedule.range_label);
  // Use displayed DAY values, not possibly stale unit_order. This also honors
  // "DAY 33 34 35 01" and "DAY 11(전체)" without changing the plan itself.
  if (!visibleDays && tidy(schedule.range_label) !== tidy(original)) {
    throw new Error("수동 지정 범위를 확인해 주세요: "+schedule.range_label);
  }
  const carry = Array.isArray(schedule.carry_unit_orders) ? schedule.carry_unit_orders.map(Number) : [];
  const orders = [...new Set([...(visibleDays ?? [Number(schedule.unit_order)]),...carry])].sort((a,b)=>a-b);
  if (!orders.length || orders.length>365 || orders.some(n=>!byOrder.has(n))) {
    throw new Error("단어장에 없는 DAY 범위입니다: "+schedule.range_label);
  }
  return orders.map(order=>{
    const label=byOrder.get(order);
    if (/^DAY\s*0*\d+$/i.test(label)) return dayText(Number(label.match(/\d+/)[0]));
    return label;
  });
}

export function normalizeExamRows(rows, students, units, categoryIdMap) {
  const byStudent=new Map(students.map(s=>[s.id,s]));
  const map = new Map();
  for(const row of rows) {
    const student=byStudent.get(row.student_id);
    const bookId=categoryIdMap[row.category_key];
    if (!student || student.active===false || !bookId) {
      throw new Error("학생 또는 단어장 연결을 확인해 주세요.");
    }
    const key=student.id+"|"+bookId;
    if (!map.has(key)) map.set(key,{
      name:student.name,school:student.school||"",bookId,examDate:row.study_date,
      names:[],
    });
    const group=map.get(key);
    group.names.push(...getPrintableNames(row,units));
  }
  const rank = {"neunglyulBase":1,"neunglyulLite":2,"onlyone":3,"priorityBeginner":4,"neunglyul":5};
  return [...map.values()]
    .map(group=>({...group,names:[...new Set(group.names)]}))
    .sort((a,b)=>a.school.localeCompare(b.school,"ko")
      || a.name.localeCompare(b.name,"ko")
      || (rank[a.bookId]??99)-(rank[b.bookId]??99));
}
