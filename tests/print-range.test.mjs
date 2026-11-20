import test from "node:test";
import assert from "node:assert/strict";
import { parseDisplayedDays, getPrintableNames, normalizeExamRows } from "../print-range.js";
const units = Array.from({length:60},(_,i)=>({category_key:"neungyul-basic",unit_order:i+1,label:"DAY "+String(i+1).padStart(2,"0")}));
units.push({category_key:"neungyul-basic",unit_order:61,label:"접사에 따른 혼동어휘"});
const names=(range_label,unit_order,carry_unit_orders=[])=>getPrintableNames({
  category_key:"neungyul-basic",study_date:"2026-11-20",range_label,unit_order,carry_unit_orders
},units);
test("single DAY and numeric order",()=>{
 assert.deepEqual(names("DAY 30",30),["Day 30"]);
 assert.deepEqual(names("DAY 31",33),["Day 31"]); // displayed DAY takes precedence over stale metadata
});
test("plan-only annotations do not restrict printed questions",()=>{
 assert.deepEqual(names("DAY 11(전체)",11),["Day 11"]);
 assert.deepEqual(names("DAY 12(1-50)",12),["Day 12"]);
});
test("range DAY 30-32 expands all days",()=>{
 assert.deepEqual(names("DAY 30–32",30),["Day 30","Day 31","Day 32"]);
 assert.deepEqual(names("DAY 52-53",53),["Day 52","Day 53"]);
});
test("explicit non-contiguous DAY values are all printed",()=>{
 assert.deepEqual(parseDisplayedDays("DAY 33 34 35 01"),[33,34,35,1]);
 assert.deepEqual(names("DAY 33 34 35 01",33),["Day 01","Day 33","Day 34","Day 35"]);
});
test("automatic rollover is combined without duplicates",()=>{
 assert.deepEqual(names("DAY 52–53",53,[52]),["Day 52","Day 53"]);
});
test("special vocabulary remains in its existing real category",()=>{
 assert.deepEqual(names("접사에 따른 혼동어휘",61),["접사에 따른 혼동어휘"]);
});
test("unknown custom text cannot silently print the wrong unit",()=>{
 assert.throws(()=>names("별도 보충 과제",30),/수동 지정 범위/);
 assert.throws(()=>names("DAY 90",30),/없는 DAY 범위/);
});
test("school/name/book and DAY labels sort consistently",()=>{
 const students=[
  {id:"2",name:"최세영",school:"신도중",active:true},
  {id:"1",name:"김다은",school:"신도중",active:true},
  {id:"3",name:"홍효주",school:"예일여중",active:true}
 ];
 const rows=[
  {student_id:"2",category_key:"neungyul-basic",study_date:"2026-11-20",range_label:"DAY 31",unit_order:31},
  {student_id:"1",category_key:"neungyul-basic",study_date:"2026-11-20",range_label:"DAY 33 34 35 01",unit_order:33},
  {student_id:"2",category_key:"neungyul-basic",study_date:"2026-11-20",range_label:"DAY 30",unit_order:30},
  {student_id:"3",category_key:"neungyul-basic",study_date:"2026-11-20",range_label:"DAY 11(전체)",unit_order:11}
 ];
 const groups=normalizeExamRows(rows,students,units,{"neungyul-basic":"neunglyulBase"});
 assert.deepEqual(groups.map(x=>x.name),["김다은","최세영","홍효주"]);
 assert.deepEqual(groups[0].names,["Day 01","Day 33","Day 34","Day 35"]);
 assert.deepEqual(groups[1].names,["Day 30","Day 31"]);
 assert.deepEqual(groups[2].names,["Day 11"]);
});
