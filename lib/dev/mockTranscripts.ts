// Pre-written transcripts for the local Dialpad simulator. Each turn's
// `delayMs` is the delay AFTER the previous turn fires (cumulative pacing,
// not absolute time from t=0). Filler turns from the prospect ("yeah",
// "mm-hm", "okay") let us verify Stage 1 gating actually filters before
// it ever invokes the suggestion model.

export type Speaker = 'operator' | 'contact';

export type MockTurn = {
  speaker: Speaker;
  text: string;
  delayMs: number;
};

export const MOCK_TRANSCRIPTS = {
  pricing_objection_call: [
    { speaker: 'operator', text: 'Hi, this is Alex from Cueline. Thanks for taking the call.', delayMs: 0 },
    { speaker: 'contact', text: 'Sure.', delayMs: 1500 },
    { speaker: 'operator', text: 'I wanted to follow up on the demo we did last week. How did it land with the team?', delayMs: 3500 },
    { speaker: 'contact', text: 'Yeah.', delayMs: 1500 },
    { speaker: 'contact', text: 'It landed pretty well overall.', delayMs: 1500 },
    { speaker: 'operator', text: 'Great. Anything that came up after the demo I should know about?', delayMs: 4000 },
    { speaker: 'contact', text: 'Mm-hm.', delayMs: 1500 },
    { speaker: 'contact', text: 'Honestly the main thing was pricing. The Growth tier is a lot more than what we are paying today.', delayMs: 1800 },
    { speaker: 'operator', text: 'Got it — happy to walk through how teams usually justify the jump. Where are you today?', delayMs: 4500 },
    { speaker: 'contact', text: 'Okay.', delayMs: 1500 },
    { speaker: 'contact', text: 'We are on the cheaper competitor at about a hundred a seat.', delayMs: 1700 },
    { speaker: 'operator', text: 'Understood. The way we usually frame it is the cost of the half-time analyst those reports replace.', delayMs: 5000 },
    { speaker: 'contact', text: 'Right.', delayMs: 1200 },
    { speaker: 'contact', text: 'That tracks. We do have one analyst who basically lives in those dashboards.', delayMs: 1500 },
    { speaker: 'operator', text: 'Exactly. If we got pricing in a range that worked, would you be looking to start in this quarter or next?', delayMs: 4500 },
    { speaker: 'contact', text: 'Yeah.', delayMs: 1200 },
    { speaker: 'contact', text: 'Honestly if we could get it signed we would want to start by Q1.', delayMs: 1800 },
    { speaker: 'operator', text: 'Perfect. Let me put together a proposal that lines up with that timeline.', delayMs: 4000 },
    { speaker: 'contact', text: 'Sounds good.', delayMs: 1500 },
  ],

  discovery_call: [
    { speaker: 'operator', text: 'Hey, this is Alex from Cueline. Glad we got time on the calendar.', delayMs: 0 },
    { speaker: 'contact', text: 'Yeah.', delayMs: 1500 },
    { speaker: 'contact', text: 'Happy to chat.', delayMs: 1200 },
    { speaker: 'operator', text: 'Before I dive into Cueline, walk me through how your team handles inbound demo requests today.', delayMs: 3800 },
    { speaker: 'contact', text: 'Sure.', delayMs: 1200 },
    { speaker: 'contact', text: 'Right now they hit a HubSpot form, route to a rep, and the rep does outbound from there.', delayMs: 1700 },
    { speaker: 'operator', text: 'Got it. And what does the rep wish they had at that point that they do not?', delayMs: 4500 },
    { speaker: 'contact', text: 'Mm-hm.', delayMs: 1300 },
    { speaker: 'contact', text: 'Mostly context. They go in cold and have to figure the prospect out from scratch.', delayMs: 1800 },
    { speaker: 'operator', text: 'Right. What does your team integrate with on the call side today — Dialpad, Zoom, something else?', delayMs: 5000 },
    { speaker: 'contact', text: 'Yeah.', delayMs: 1300 },
    { speaker: 'contact', text: 'We are on Dialpad.', delayMs: 1500 },
    { speaker: 'contact', text: 'Okay so what does Cueline actually integrate with out of the box?', delayMs: 2200 },
    { speaker: 'operator', text: 'Dialpad first — we tap into the live transcription stream. Zoom and Meet are on the v2 roadmap.', delayMs: 4500 },
    { speaker: 'contact', text: 'Got it.', delayMs: 1200 },
    { speaker: 'contact', text: 'Okay.', delayMs: 1200 },
    { speaker: 'operator', text: 'Last question — who else would be involved in evaluating something like this?', delayMs: 4000 },
    { speaker: 'contact', text: 'Yeah probably my VP of Sales and our RevOps lead would need to weigh in.', delayMs: 2500 },
    { speaker: 'operator', text: 'Perfect. Let me put a short loom together you can share with both of them.', delayMs: 3500 },
    { speaker: 'contact', text: 'Sounds good.', delayMs: 1500 },
  ],

  buying_signal_call: [
    { speaker: 'operator', text: 'Hi, Alex from Cueline. Good to finally connect.', delayMs: 0 },
    { speaker: 'contact', text: 'Likewise.', delayMs: 1500 },
    { speaker: 'operator', text: 'Just to set the agenda — I want to spend twenty minutes on what your team is trying to solve and where Cueline fits.', delayMs: 4500 },
    { speaker: 'contact', text: 'Yeah.', delayMs: 1200 },
    { speaker: 'contact', text: 'That works.', delayMs: 1300 },
    { speaker: 'operator', text: 'Quickly, what brought you to us in the first place?', delayMs: 3500 },
    { speaker: 'contact', text: 'Sure.', delayMs: 1200 },
    { speaker: 'contact', text: 'We saw the demo at the Outbound conference and the live suggest piece looked sharp.', delayMs: 2000 },
    { speaker: 'operator', text: 'Glad it landed. Are you running outbound or inbound mostly?', delayMs: 3000 },
    { speaker: 'contact', text: 'Mostly outbound.', delayMs: 1500 },
    { speaker: 'contact', text: 'We have ten reps and want to ramp another five next quarter.', delayMs: 2200 },
    { speaker: 'operator', text: 'Got it. Are the new reps the bigger pain — onboarding speed?', delayMs: 4000 },
    { speaker: 'contact', text: 'Mm-hm.', delayMs: 1200 },
    { speaker: 'contact', text: 'Exactly. Time to first booked meeting is what we are trying to crush.', delayMs: 2000 },
    { speaker: 'operator', text: 'That is exactly the thing live assist accelerates. New reps get a senior rep in their ear on every call.', delayMs: 4500 },
    { speaker: 'contact', text: 'Yeah.', delayMs: 1200 },
    { speaker: 'contact', text: 'Right.', delayMs: 1100 },
    { speaker: 'contact', text: 'Honestly if you can get this stood up before Jan 1 we would sign this week.', delayMs: 2200 },
    { speaker: 'operator', text: 'Understood. Let me get an order form over today and we can have you in onboarding by next week.', delayMs: 4000 },
    { speaker: 'contact', text: 'Perfect.', delayMs: 1500 },
  ],
} as const satisfies Record<string, MockTurn[]>;

export type MockTranscriptName = keyof typeof MOCK_TRANSCRIPTS;
export const MOCK_TRANSCRIPT_NAMES = Object.keys(MOCK_TRANSCRIPTS) as MockTranscriptName[];
