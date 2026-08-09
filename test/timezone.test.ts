import test from "node:test";import assert from "node:assert/strict";import {eventDateTimeLocal,eventLocalToIso} from "../src/web/pages/ReviewManagementPages.js";
test("review round datetime-local round-trips in event timezone",()=>{for(const local of ["2027-01-15T09:30","2027-07-15T09:30"]){const iso=eventLocalToIso(local);assert.equal(eventDateTimeLocal(iso),local)}});
