// Fixed wording used by the app: plan prompts (from the SafeCare Relapse Prevention
// Plan), check-in choices, daily lines and support services. Edit freely.

const GOOD_LIFE = (eg) => ({
  n: 1, title: 'My good life',
  note: 'The short version, the part you carry.',
  boxes: [
    { k: 'good_matters', q: 'What matters most to me in the life I want?' },
    { k: 'good_ways', q: 'What are healthy ways I can work towards those things?', eg },
  ],
});
const STRENGTHS = {
  n: 2, title: 'My strengths and supports',
  boxes: [
    { k: 'strengths', q: 'What am I good at, and what helps me feel steady?' },
    { k: 'lean', q: 'Who are the people I can lean on?' },
  ],
};
const SIGNS = (eg) => ({
  n: 6, title: 'My early warning signs',
  note: 'Small, specific and early. Write each one as something you could check.',
  boxes: [{ k: 'signs', q: 'What are the first signs that I am drifting off track?', eg }],
});
const INSTEAD = {
  n: 7, title: 'What I do instead',
  note: 'Give a person’s name, not “someone”.',
  boxes: [{ k: 'instead', q: 'When I notice those signs, what will I do, and who will I contact?' }],
};
const TEAM = {
  n: 9, title: 'My support team',
  note: 'People around you who are not offending, and at least one adult you can be honest with. Put each person on their own line with their number.',
  boxes: [{ k: 'team', q: 'Names and numbers of people I can call.' }],
};
const CONDITIONS = {
  n: 10, title: 'My conditions',
  boxes: [{ k: 'conditions', q: 'What reporting or supervision conditions do I follow, and who is my contact?' }],
};
const COMMIT = {
  n: 13, title: 'My commitment',
  note: 'This plan is mine. I will keep it close, use it, and update it at every review.',
  boxes: [{ k: 'signed', q: 'Signed and dated' }],
};

export const PLAN_VARIANTS = {
  online: 'Plan with internet and device sections',
  contact: 'Plan with situational safety sections',
};

export const PLAN = {
  online: [
    GOOD_LIFE('time with people I trust, steady work or study, keeping busy with things I enjoy.'),
    STRENGTHS,
    {
      n: 3, title: 'Understanding my offending',
      note: 'Write about the need you were trying to meet and how you were feeling, not the details of what happened.',
      guard: true,
      boxes: [
        { k: 'around', q: 'What was going on in my life around that time?' },
        { k: 'feeling', q: 'What was I feeling, and what was I trying to find or get away from?' },
        { k: 'online_part', q: 'What part did going online play for me?' },
      ],
    },
    {
      n: 4, title: 'My high-risk feelings and times',
      boxes: [{ k: 'risk', q: 'Which feelings or situations make things harder for me?', eg: 'feeling low or alone, being bored, being stressed, being awake and alone online late at night, using a screen to switch off from everything.' }],
    },
    {
      n: 5, title: 'My internet and device plan',
      boxes: [{ k: 'device_plan', q: 'How will I set up my devices so they support me, and who helps me keep to this?', eg: 'agreed filters or monitoring, devices used in shared spaces, set times away from screens, someone I check in with.' }],
    },
    SIGNS('pulling away from people, more time alone online, telling myself little lies about it, feeling flat.'),
    INSTEAD,
    {
      n: 8, title: 'Remembering the harm',
      note: 'Keep this in your own words.',
      boxes: [{ k: 'harm', q: 'Why does it matter to me that these images involve real children being harmed?' }],
    },
    TEAM,
    CONDITIONS,
    {
      n: 11, title: 'If I have a slip',
      boxes: [{ k: 'slip', q: 'What are my first three steps, and who do I tell straight away?' }],
    },
    {
      n: 12, title: 'My online life',
      note: 'What a screen was doing for you, and what has taken its place since. Do not score yourself against how things used to be.',
      boxes: [
        { k: 'online_before', q: 'What did a typical week online look like for me before?' },
        { k: 'online_now', q: 'What does a typical week look like for me now?' },
        { k: 'online_gave', q: 'What was going online giving me that I was not getting anywhere else?' },
        { k: 'online_avoid', q: 'What was it letting me avoid or switch off from?' },
        { k: 'online_filled', q: 'What has filled that gap since?' },
        { k: 'online_unfilled', q: 'What has not been filled yet?' },
        { k: 'online_add', q: 'One thing I will add this month.', eg: 'joining a local group or class, a regular catch-up with a friend, a physical hobby with a fixed weekly time.' },
      ],
    },
    COMMIT,
  ],
  contact: [
    GOOD_LIFE('time with adults I trust, steady work or study, keeping busy with things I enjoy.'),
    STRENGTHS,
    {
      n: 3, title: 'Understanding my offending',
      note: 'Write about the need you were trying to meet and how you were feeling, not the details of what happened.',
      guard: true,
      boxes: [
        { k: 'around', q: 'What was going on in my life around that time?' },
        { k: 'feeling', q: 'What was I feeling, and what need was I trying to meet in a harmful way?' },
      ],
    },
    {
      n: 4, title: 'My high-risk situations',
      boxes: [{ k: 'risk', q: 'Which situations do I need to plan around to keep everyone safe?', eg: 'being alone with a child, unstructured time, times I feel low or rejected, alcohol or other substances.' }],
    },
    {
      n: 5, title: 'My situational safety plan',
      boxes: [{ k: 'safety_plan', q: 'How will I make sure I am not alone with a child, and who knows my plan?', eg: 'staying where other trusted adults are present, being open with the people around me, keeping away from roles that put me alone with children.' }],
    },
    SIGNS('pulling away from people, dwelling on grievances, feeling low, keeping things secret.'),
    INSTEAD,
    {
      n: 8, title: 'Remembering the harm',
      note: 'Keep this in your own words.',
      boxes: [{ k: 'harm', q: 'Why does it matter to me to keep children safe from harm?' }],
    },
    TEAM,
    CONDITIONS,
    {
      n: 11, title: 'Warning signs or a slip',
      boxes: [{ k: 'slip', q: 'What are my first three steps, and who do I tell straight away?' }],
    },
    COMMIT,
  ],
};

// The workbook says to fill in the good life and support sections before the risk sections.
export const PLAN_FIRST = ['good_matters', 'good_ways', 'strengths', 'lean', 'team'];

export const GUARD_TEXT =
  'For your protection, do not describe your offending behaviour or the child anywhere in this app. Write about needs, feelings and decisions.';

export const SERVICES = [
  { name: 'Lifeline', number: '13 11 14', note: 'Crisis support, 24 hours' },
  { name: 'Stop It Now! Australia', number: '1800 01 1800', note: 'Anonymous helpline. Hours are limited, so check their website' },
  { name: 'Emergency', number: '000', note: '' },
];

// Concrete choices, because naming a feeling on the spot is hard.
export const BODY_CHIPS = ['tired', 'wired', 'heavy', 'tense', 'restless', 'hungry', 'sore', 'numb', 'flat', 'thoughts racing', 'steady', 'okay'];
export const SLEEP_CHIPS = ['under 4 hours', '4 to 5', '6 to 7', '8 or more'];
export const DAY_CHIPS = [
  'spoke with someone in person or by phone',
  'went outside',
  'did something creative',
  'kept an appointment',
  'finished something',
  'was alone most of the day',
  'was online late with nothing to do',
  'skipped a meal',
  'cancelled or avoided something',
];

export const WEEKLY_QUESTIONS = [
  { k: 'working', q: 'What has been working since last time.' },
  { k: 'slipping', q: 'What has been slipping.' },
  { k: 'changed', q: 'What has changed in my life that my plan does not cover yet.' },
  { k: 'signs', q: 'Which warning signs turned up, and what I did about them.' },
  { k: 'change', q: 'What is the one thing I am changing before the next review.' },
];

export const LINES = [
  'One thing at a time. The next thing is enough.',
  'You do not have to catch the first link. Catching any link early still steers you back.',
  'Eat something before you decide anything.',
  'Showing up to today’s appointments counts.',
  'Reaching out early is a strength.',
  'Finished and plain beats perfect and unfinished.',
  'Small and done is still done.',
  'You have kept going through harder days than this one.',
  'People are still in your corner. Let one of them hear from you today.',
  'Rest counts as doing something.',
  'The plan works when it is used, even badly.',
  'Noticing, then choice, then action. Noticing comes first.',
  'Late is still better than absent. Go anyway.',
  'Today only needs three things from you.',
  'Drink some water. Then look at the list.',
  'A rough hour is information. Check what your body needs first.',
  'A missed day is a reason to restart today, from here.',
  'You can do the first two minutes of almost anything.',
  'Honest and awkward beats smooth and hidden.',
  'A low number is information. It is not a verdict on you.',
  'Measure how quickly you notice, and how quickly you recover.',
  'Ask the question. The answer is usually kinder than the guess.',
];

export const DEFAULT_ROUTINES = [
  { label: 'Breakfast', time: '08:30', type: 'meal' },
  { label: 'Water', time: '10:30', type: 'water' },
  { label: 'Lunch', time: '12:30', type: 'meal' },
  { label: 'Water', time: '15:00', type: 'water' },
  { label: 'Dinner', time: '18:30', type: 'meal' },
  { label: 'Wind down for sleep', time: '23:00', type: 'sleep' },
];

export const DEFAULT_SETTINGS = {
  morningAt: '09:00',
  eveningAt: '21:30',
  weeklyDay: 0, // Sunday
  weeklyAt: '17:00',
  details: false, // show titles in notifications
  logSigns: true,
  showGuard: true, // the reminder about what not to write
  lines: '',
};
