import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
// Tiny stack VM, make.fun ISA v1, written from scratch.
// Answers every /input/<id>/ (program.bin + input.bin) into
// /output/<id>/stdout.bin and /output/<id>/exit.txt.
// 32-bit wrapping ints, 256 stack, 64 call depth, 256 mem words,
// 1,000,000 steps, 65,536 output bytes.
function shape(op: number): [number, number, number] | null {
  switch (op) {
    case 0x00: return [0, 0, 0];
    case 0x01: return [1, 0, 1];
    case 0x02: return [4, 0, 1];
    case 0x03: return [0, 1, 0];
    case 0x04: return [0, 1, 2];
    case 0x05: return [0, 2, 2];
    case 0x06: return [0, 2, 3];
    case 0x07: return [0, 3, 3];
    case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
    case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d:
    case 0x1e: case 0x20: case 0x21: case 0x22: return [0, 2, 1];
    case 0x17: case 0x1b: return [0, 1, 1];
    case 0x30: return [2, 0, 0];
    case 0x31: case 0x32: return [2, 1, 0];
    case 0x33: return [2, 0, 0];
    case 0x34: return [0, 0, 0];
    case 0x40: return [0, 1, 1];
    case 0x41: return [0, 2, 0];
    case 0x50: case 0x51: case 0x53: return [0, 1, 0];
    case 0x52: return [0, 0, 1];
    default: return null;
  }
}
function run(p: Uint8Array, inp: Uint8Array): { o: Uint8Array; c: number } {
  const s = new Int32Array(256);
  let sp = 0;
  const cs = new Int32Array(64);
  let cp = 0;
  const m = new Int32Array(256);
  const out = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, st = 0;
  const te = new TextEncoder();
  const end = (c: number) => ({ o: out.slice(0, ol), c });
  for (;;) {
    if (st === 1000000) return end(10);
    if (pc < 0 || pc >= p.length) return end(9);
    const op = p[pc];
    const sh = shape(op);
    if (!sh) return end(5);
    const [im, po, pu] = sh;
    if (pc + im >= p.length) return end(9);
    st++;
    const nx = pc + 1 + im;
    if (sp < po) return end(2);
    if (sp - po + pu > 256) return end(3);
    pc = nx;
    switch (op) {
      case 0x00: return end(0);
      case 0x01: s[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 0x02: s[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: s[sp] = s[sp - 1]; sp++; break;
      case 0x05: { const t = s[sp - 1]; s[sp - 1] = s[sp - 2]; s[sp - 2] = t; break; }
      case 0x06: s[sp] = s[sp - 2]; sp++; break;
      case 0x07: { const a = s[sp - 3]; s[sp - 3] = s[sp - 2]; s[sp - 2] = s[sp - 1]; s[sp - 1] = a; break; }
      case 0x17: s[sp - 1] = (-s[sp - 1]) | 0; break;
      case 0x1b: s[sp - 1] = ~s[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
      case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d:
      case 0x1e: case 0x20: case 0x21: case 0x22: {
        const b = s[sp - 1], a = s[sp - 2];
        let r: number;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) {
          if (b === 0) return end(4);
          r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        } else if (op === 0x14) {
          if (b === 0) return end(4);
          r = b === -1 ? 0 : (a % b) | 0;
        } else if (op === 0x15) {
          if (b === 0) return end(4);
          r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (op === 0x16) {
          if (b === 0) return end(4);
          r = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; s[sp++] = r; break;
      }
      case 0x30: case 0x31: case 0x32: {
        const off = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let go = true;
        if (op !== 0x30) { const v = s[--sp]; go = op === 0x31 ? v === 0 : v !== 0; }
        if (go) pc = nx + off;
        break;
      }
      case 0x33:
        if (cp === 64) return end(7);
        cs[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 0x34:
        if (cp === 0) return end(8);
        pc = cs[--cp];
        break;
      case 0x40: {
        const a = s[sp - 1];
        if (a < 0 || a >= 256) return end(6);
        s[sp - 1] = m[a];
        break;
      }
      case 0x41: {
        const a = s[sp - 1], v = s[sp - 2];
        if (a < 0 || a >= 256) return end(6);
        sp -= 2; m[a] = v;
        break;
      }
      case 0x50: {
        const b = te.encode(String(s[sp - 1]));
        if (ol + b.length > 65536) return end(11);
        sp--; out.set(b, ol); ol += b.length;
        break;
      }
      case 0x51:
        if (ol + 1 > 65536) return end(11);
        out[ol++] = s[--sp] & 255;
        break;
      case 0x52: s[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: return end(s[--sp] & 255);
    }
  }
}
const IN = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
for (const id of readdirSync(IN).filter((d) => /^i\d+$/.test(d)).sort()) {
  const prog = readFileSync(`${IN}/${id}/program.bin`);
  let input = new Uint8Array(0);
  try { input = readFileSync(`${IN}/${id}/input.bin`); } catch { /* empty */ }
  const r = run(prog, input);
  mkdirSync(`${OUT}/${id}`, { recursive: true });
  writeFileSync(`${OUT}/${id}/stdout.bin`, r.o);
  writeFileSync(`${OUT}/${id}/exit.txt`, `${r.c}\n`);
}
