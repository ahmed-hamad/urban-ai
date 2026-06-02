import * as XLSX from "./node_modules/xlsx/xlsx.mjs";
import { readFileSync } from "fs";
const buffer = readFileSync("brGate.xlsx");
const wb = XLSX.read(buffer,{type:"buffer", cellDates:true});
console.log("sheets=", wb.SheetNames);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws,{defval:""});
console.log("rows=", rows.length);
console.log("cols=", Object.keys(rows[0]||{}));
console.log("first5=", rows.slice(0,5));
const dateCols = Object.keys(rows[0]||{}).filter(c=>new RegExp('date|????','i').test(c));
console.log("dateCols=", dateCols);
if(dateCols.length){
  for(const col of dateCols){
    const vals=rows.map((r,i)=>({i:i+2,v:r[col]})).filter(x=>x.v!=="" && x.v!=null);
    console.log("col",col,"types", [...new Set(vals.map(x=>typeof x.v))].slice(0,10));
    console.log("sample", vals.slice(0,20));
    console.log("2027", vals.filter(x=>(x.v instanceof Date && x.v.getFullYear()===2027)||(typeof x.v==="string" && x.v.includes("2027"))).slice(0,20));
  }
}
