// Regression tests for the circuits in fixtures/circuits/ (elements the examples don't use, bug
// reproductions, loader edge cases).  Each circuit is loaded with the app's loader, reset and run
// for a fixed number of timesteps, and compared with fixtures/circuits/expected/<file>.json: the
// elements that loaded, whether the simulation stopped, and every element's post voltages and
// current at regular intervals.  Loading must not log an exception.
//
// To record a new circuit's expected results, or re-record after an intended change in simulator
// behavior:
//   RECORD_CIRCUITS=1 npx vitest run CircuitRegression -t sram.txt

import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { initHeadless, createApp, resetCircuit, step, M } from "./HeadlessSim";

const circuitDir = path.resolve(__dirname, "fixtures/circuits");
const expectedDir = path.join(circuitDir, "expected");
const record = !!process.env.RECORD_CIRCUITS;

// notes and data files kept next to the circuits
const NOT_CIRCUITS = new Set(["tsbug-README.txt", "missing-tests.txt", "data-input-data.txt"]);

// circuits the app can't load, and why
const KNOWN_BROKEN = new Map([
    ["lm324-sub.txt", "subcircuit model in the 2020 text format, before models had a size and pin sides"],
]);

const STEPS = 1000;
const SAMPLE_EVERY = 50;
// a value matches if it's within 0.1% of itself or of the largest value of its kind in the
// circuit (full scale), so values near zero aren't held to a tighter standard than the rest
const TOLERANCE = 1e-3;

interface Sample { t: number; volts: number[][]; currents: number[] }
interface Result { elements: string[]; stop: string | null; samples: Sample[] }

beforeAll(initHeadless);

const round = (x: number) => Number(x.toPrecision(6));

function runCircuit(text: string): { result: Result; log: string[] } {
    const { app, sim } = createApp();
    const log: string[] = [];
    const consoleLog = vi.spyOn(console, "log").mockImplementation((...a: any[]) => { log.push(a.join(" ")); });
    try {
        app.loader.readCircuit(text, M.CircuitLoader.RC_NO_CENTER);
        resetCircuit(app, sim);
        const elms = app.elmList.filter((ce: any) => !ce.isWireEquivalent());
        const result: Result = { elements: app.elmList.map((ce: any) => ce.constructor.name), stop: null, samples: [] };
        for (let s = 1; s <= STEPS && app.stopMessage == null; s++) {
            step(app, sim);
            if (s % SAMPLE_EVERY === 0 && app.stopMessage == null)
                result.samples.push({
                    t: round(sim.t),
                    volts: elms.map((ce: any) => ce.nodes.slice(0, ce.getPostCount()).map((n: any) => round(n?.v ?? 0))),
                    currents: elms.map((ce: any) => round(ce.getCurrent())),
                });
        }
        result.stop = app.stopMessage;
        return { result, log };
    } finally {
        consoleLog.mockRestore();
    }
}

// one sample per line, so a re-recording diffs readably
function format(result: Result): string {
    const lines = result.samples.map(s => "    " + JSON.stringify(s));
    return `{\n  "elements": ${JSON.stringify(result.elements)},\n  "stop": ${JSON.stringify(result.stop)},\n` +
        `  "samples": [\n${lines.join(",\n")}\n  ]\n}\n`;
}

function compare(actual: Result, expected: Result): string[] {
    const failures: string[] = [];
    if (JSON.stringify(actual.elements) !== JSON.stringify(expected.elements))
        return [`loaded elements ${JSON.stringify(actual.elements)}, expected ${JSON.stringify(expected.elements)}`];
    if (actual.stop !== expected.stop)
        failures.push(`simulation stop: ${JSON.stringify(actual.stop)}, expected ${JSON.stringify(expected.stop)}`);
    if (actual.samples.length !== expected.samples.length)
        return [...failures, `${actual.samples.length} samples, expected ${expected.samples.length}`];

    const fullScaleV = Math.max(...expected.samples.flatMap(s => s.volts.flat().map(Math.abs)), 0);
    const fullScaleI = Math.max(...expected.samples.flatMap(s => s.currents.map(Math.abs)), 0);
    const close = (a: number, e: number, fullScale: number) =>
        Math.abs(a - e) <= TOLERANCE * Math.max(Math.abs(e), fullScale) + 1e-12;
    for (let s = 0; s !== expected.samples.length && failures.length < 10; s++) {
        const a = actual.samples[s], e = expected.samples[s];
        if (!close(a.t, e.t, e.t))
            failures.push(`sample ${s}: t=${a.t}, expected ${e.t}`);
        for (let i = 0; i !== e.volts.length && failures.length < 10; i++) {
            const elm = `${expected.elements[i]} #${i}`;
            for (let p = 0; p !== e.volts[i].length; p++)
                if (!close(a.volts[i][p], e.volts[i][p], fullScaleV))
                    failures.push(`t=${e.t}: ${elm} post ${p} at ${a.volts[i][p]} V, expected ${e.volts[i][p]} V`);
            if (!close(a.currents[i], e.currents[i], fullScaleI))
                failures.push(`t=${e.t}: ${elm} current ${a.currents[i]} A, expected ${e.currents[i]} A`);
        }
    }
    return failures;
}

function circuitFiles(dir: string, prefix = ""): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
        if (d.isDirectory())
            return d.name === "expected" ? [] : circuitFiles(path.join(dir, d.name), prefix + d.name + "/");
        return /\.(txt|circuitjs)$/.test(d.name) && !NOT_CIRCUITS.has(d.name) ? [prefix + d.name] : [];
    }).sort();
}

describe("circuit regression", () => {
    for (const name of circuitFiles(circuitDir)) {
        if (KNOWN_BROKEN.has(name)) {
            it.skip(`${name} (${KNOWN_BROKEN.get(name)})`, () => {});
            continue;
        }
        it(name, () => {
            const { result, log } = runCircuit(fs.readFileSync(path.join(circuitDir, name), "utf8"));
            expect(log.filter(l => /exception|unrecognized/i.test(l))).toEqual([]);

            const expectedFile = path.join(expectedDir, name + ".json");
            if (record) {
                fs.mkdirSync(path.dirname(expectedFile), { recursive: true });
                fs.writeFileSync(expectedFile, format(result));
                return;
            }
            if (!fs.existsSync(expectedFile))
                throw new Error(`no expected results; record them with RECORD_CIRCUITS=1`);
            expect(compare(result, JSON.parse(fs.readFileSync(expectedFile, "utf8")))).toEqual([]);
        });
    }
});
