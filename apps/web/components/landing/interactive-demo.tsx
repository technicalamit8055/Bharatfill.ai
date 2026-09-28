'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowRight, Check, X } from 'lucide-react';
import { BharatfillLogo } from './bharatfill-logo';

/** Fictional demo address (Rohini, North West Delhi, Delhi); also baked into ai-autofill-preview.png. */
const DEMO_DELHI_ADDRESS = 'B-42, Sector 14, Rohini, New Delhi 110085';

const OLD_WAY_POINTS = [
  'Manually copy-pasting details from documents or notes.',
  'Frequent typing errors in Aadhaar, PAN or spelling mistakes.',
  'Long waiting queues at Cyber Cafes & CSC Service Centres.',
  'Form timeouts causing lost data and frustrating re-entries.',
];

const NEW_WAY_POINTS = [
  'Profile stored once, re-used across 100+ government & web portals.',
  '99.8% field recognition accuracy using smart AI mapping.',
  'Zero data entry errors & bank-grade Aadhaar masking privacy.',
  'Serve 10× more customers per day with zero stress.',
];

interface Profile {
  id: string;
  name: string;
  category: string;
  aadhaar: string;
  pan: string;
  dob: string;
  fatherName: string;
  email: string;
  address: string;
  education: string;
}

const PROFILES: Profile[] = [
  {
    id: '1',
    name: 'Rahul Sharma',
    category: 'OBC / Student',
    aadhaar: 'XXXX-XXXX-4821',
    pan: 'ABCPS1234F',
    dob: '15-08-2001',
    fatherName: 'Rajesh Sharma',
    email: 'rahul.sharma@gmail.com',
    address: DEMO_DELHI_ADDRESS,
    education: 'B.Tech Computer Science (78.5%)',
  },
  {
    id: '2',
    name: 'Priya Verma',
    category: 'General / Professional',
    aadhaar: 'XXXX-XXXX-9102',
    pan: 'XYZPV5678K',
    dob: '22-03-1998',
    fatherName: 'Suresh Verma',
    email: 'priya.verma@outlook.com',
    address: 'C-17, Sector 8, Rohini, New Delhi 110085',
    education: 'M.Sc Biotechnology (82.1%)',
  },
  {
    id: '3',
    name: 'Amit Kumar',
    category: 'SC / Applicant',
    aadhaar: 'XXXX-XXXX-3349',
    pan: 'JKLAK9012M',
    dob: '10-11-2002',
    fatherName: 'Ramesh Kumar',
    email: 'amit.kumar@yahoo.com',
    address: 'D-9, Sector 16, Rohini, New Delhi 110089',
    education: 'Senior Secondary 12th (85.0%)',
  },
];

export function InteractiveDemo() {
  const [selectedProfileId, setSelectedProfileId] = useState<string>('1');
  const [isFilled, setIsFilled] = useState<boolean>(true);
  const [isFilling, setIsFilling] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'demo' | 'before-after'>('demo');

  const defaultProfile = PROFILES[0]!;
  const activeProfile = PROFILES.find((p) => p.id === selectedProfileId) ?? defaultProfile;

  const handleTriggerFill = () => {
    setIsFilling(true);
    setIsFilled(false);
    setTimeout(() => {
      setIsFilling(false);
      setIsFilled(true);
    }, 700);
  };

  return (
    <section id="demo" className="relative py-16 sm:py-24 bg-white overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5 text-xs font-bold tracking-widest text-[#0066FF] uppercase">
            Interactive Experience
          </h2>
          <p className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-5xl">
            See <span className="text-[#0066FF]">Bharatfill AI</span> in Action
          </p>
          <p className="mt-4 text-base text-slate-600 sm:text-lg">
            Experience how the extension detects form fields and fills them automatically with complete customer profile mapping.
          </p>

          {/* Toggle View Buttons */}
          <div className="mt-6 inline-flex rounded-xl bg-white p-1 border border-slate-200 shadow-sm">
            <button
              onClick={() => setActiveTab('demo')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all sm:text-sm ${activeTab === 'demo'
                ? 'bg-[#0066FF] text-white shadow-md shadow-blue-500/25'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              ⚡ Live Extension Simulator
            </button>
            <button
              onClick={() => setActiveTab('before-after')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all sm:text-sm ${activeTab === 'before-after'
                ? 'bg-[#0066FF] text-white shadow-md shadow-blue-500/25'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              📊 Manual vs AI Comparison
            </button>
          </div>
        </div>

        {activeTab === 'demo' ? (
          /* Live Browser Window Simulator */
          <div className="mt-10 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-w-6xl mx-auto">

            {/* Simulated Browser Bar */}
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-100/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-3 w-3 rounded-full bg-rose-400 shrink-0" />
                <span className="h-3 w-3 rounded-full bg-amber-400 shrink-0" />
                <span className="h-3 w-3 rounded-full bg-emerald-400 shrink-0" />
                <div className="ml-2 sm:ml-4 flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white px-3 py-1 text-xs text-slate-600 sm:w-96 truncate border border-slate-200 shadow-sm">
                  <svg className="h-3.5 w-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="truncate">https://serviceonline.bihar.gov.in/rtps/application-form</span>
                </div>
              </div>

              {/* Profile Picker Control */}
              <div className="flex items-center gap-2">
                <span className="hidden whitespace-nowrap text-xs text-slate-500 sm:inline font-medium">Active Profile:</span>
                <select
                  value={selectedProfileId}
                  onChange={(e) => {
                    setSelectedProfileId(e.target.value);
                    handleTriggerFill();
                  }}
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 xl:py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm sm:w-auto"
                >
                  {PROFILES.map((p) => (
                    <option key={p.id} value={p.id} className="text-slate-900">
                      👤 {p.name} ({p.category})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Main Interactive Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 relative min-h-[500px]">

              {/* Left Column: Simulated Web Portal Form (8 cols) */}
              <div className="lg:col-span-8 p-6 sm:p-8 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/50">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-6">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src="/Rtps-bihar-Photoroom.png"
                      alt="RTPS Bihar Logo"
                      className="h-12 sm:h-16 lg:h-20 w-auto object-contain shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                        LIVE FORM DETECTED
                      </span>
                      <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 mt-0.5">
                        RTPS Bihar &mdash; Certificate Service Portal
                      </h3>
                    </div>
                  </div>
                  <button
                    onClick={handleTriggerFill}
                    disabled={isFilling}
                    className="flex items-center gap-2 rounded-xl bg-[#0066FF] hover:bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/25 transition-all active:scale-95 disabled:opacity-50 shrink-0"
                  >
                    <svg className="h-4 w-4 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {isFilling ? 'AI Filling...' : '⚡ Re-Fill Form'}
                  </button>
                </div>

                {/* Form Fields Display */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Candidate Name */}
                  <div className="relative">
                    <label className="text-xs font-semibold text-slate-700 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      Candidate Full Name
                      {isFilled && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded border shrink-0 whitespace-nowrap border-emerald-200">
                          ✓ 99.9% Match
                        </span>
                      )}
                    </label>
                    <div
                      className={`mt-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-500 ${isFilled
                        ? 'border-emerald-300 bg-emerald-50/70 text-slate-900'
                        : 'border-slate-300 bg-white text-slate-400'
                        }`}
                    >
                      {isFilled ? activeProfile.name : 'Waiting for autofill...'}
                    </div>
                  </div>

                  {/* Father's Name */}
                  <div className="relative">
                    <label className="text-xs font-semibold text-slate-700 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      Father / Guardian Name
                      {isFilled && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded border shrink-0 whitespace-nowrap border-emerald-200">
                          ✓ 99.8% Match
                        </span>
                      )}
                    </label>
                    <div
                      className={`mt-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-500 ${isFilled
                        ? 'border-emerald-300 bg-emerald-50/70 text-slate-900'
                        : 'border-slate-300 bg-white text-slate-400'
                        }`}
                    >
                      {isFilled ? activeProfile.fatherName : 'Waiting for autofill...'}
                    </div>
                  </div>

                  {/* Aadhaar Number */}
                  <div className="relative">
                    <label className="text-xs font-semibold text-slate-700 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      Aadhaar ID (Masked Privacy)
                      {isFilled && (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded border shrink-0 whitespace-nowrap border-blue-200">
                          🔒 Masked
                        </span>
                      )}
                    </label>
                    <div
                      className={`mt-1 rounded-lg border px-3 py-2 text-sm font-mono font-medium transition-all duration-500 ${isFilled
                        ? 'border-blue-300 bg-blue-50/70 text-blue-900'
                        : 'border-slate-300 bg-white text-slate-400'
                        }`}
                    >
                      {isFilled ? activeProfile.aadhaar : 'Waiting for autofill...'}
                    </div>
                  </div>

                  {/* Date of Birth */}
                  <div className="relative">
                    <label className="text-xs font-semibold text-slate-700 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      Date of Birth (DD-MM-YYYY)
                      {isFilled && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded border shrink-0 whitespace-nowrap border-emerald-200">
                          ✓ 100% Match
                        </span>
                      )}
                    </label>
                    <div
                      className={`mt-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-500 ${isFilled
                        ? 'border-emerald-300 bg-emerald-50/70 text-slate-900'
                        : 'border-slate-300 bg-white text-slate-400'
                        }`}
                    >
                      {isFilled ? activeProfile.dob : 'Waiting for autofill...'}
                    </div>
                  </div>

                  {/* Email Address */}
                  <div className="relative sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      Email Address
                      {isFilled && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded border shrink-0 whitespace-nowrap border-emerald-200">
                          ✓ Verified Profile Email
                        </span>
                      )}
                    </label>
                    <div
                      className={`mt-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-500 ${isFilled
                        ? 'border-emerald-300 bg-emerald-50/70 text-slate-900'
                        : 'border-slate-300 bg-white text-slate-400'
                        }`}
                    >
                      {isFilled ? activeProfile.email : 'Waiting for autofill...'}
                    </div>
                  </div>

                  {/* Address */}
                  <div className="relative sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      Permanent Address
                      {isFilled && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded border shrink-0 whitespace-nowrap border-emerald-200">
                          ✓ Auto-Mapped Address
                        </span>
                      )}
                    </label>
                    <div
                      className={`mt-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-500 ${isFilled
                        ? 'border-emerald-300 bg-emerald-50/70 text-slate-900'
                        : 'border-slate-300 bg-white text-slate-400'
                        }`}
                    >
                      {isFilled ? activeProfile.address : 'Waiting for autofill...'}
                    </div>
                  </div>
                </div>

                {/* Status bar bottom */}
                <div className="mt-6 flex flex-col gap-2 rounded-xl bg-blue-50 border border-blue-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-blue-900">
                      {isFilled ? 'Form 100% Mapped & Filled in 1.2s' : 'Ready to Autofill'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    Human review before submit &bull; CAPTCHA safe
                  </span>
                </div>
              </div>

              {/* Right Column: Extension Panel — on tablets, profile and button beside the detected fields */}
              <div className="lg:col-span-4 p-6 bg-slate-50 flex flex-col md:grid md:grid-cols-2 md:gap-x-8 lg:flex">
                <div>
                  {/* Extension Header with Official Bharatfill Logo */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <BharatfillLogo height={64} className="min-[360px]:hidden" />
                    <BharatfillLogo height={80} className="hidden min-[360px]:flex" />
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                      ON
                    </span>
                  </div>

                  {/* Profile Selection card */}
                  <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/80 p-3">
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                      Selected Vault Profile
                    </span>
                    <p className="text-sm font-bold text-slate-900 mt-1">{activeProfile.name}</p>
                    <p className="text-xs text-slate-600 font-medium">{activeProfile.category}</p>
                  </div>
                </div>

                {/* Field Mapping Summary */}
                <div className="mt-4 space-y-2 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 lg:mt-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Detected Fields (6/6)</span>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between rounded bg-white p-2 border border-slate-200 shadow-sm">
                      <span className="text-slate-700 font-medium">Full Name</span>
                      <span className="font-bold text-emerald-700">Matched</span>
                    </div>
                    <div className="flex justify-between rounded bg-white p-2 border border-slate-200 shadow-sm">
                      <span className="text-slate-700 font-medium">Father Name</span>
                      <span className="font-bold text-emerald-700">Matched</span>
                    </div>
                    <div className="flex justify-between rounded bg-white p-2 border border-slate-200 shadow-sm">
                      <span className="text-slate-700 font-medium">Aadhaar (Masked)</span>
                      <span className="font-bold text-blue-700">Protected</span>
                    </div>
                    <div className="flex justify-between rounded bg-white p-2 border border-slate-200 shadow-sm">
                      <span className="text-slate-700 font-medium">Date of Birth</span>
                      <span className="font-bold text-emerald-700">Matched</span>
                    </div>
                    <div className="flex justify-between rounded bg-white p-2 border border-slate-200 shadow-sm">
                      <span className="text-slate-700 font-medium">Email & Address</span>
                      <span className="font-bold text-emerald-700">Matched</span>
                    </div>
                  </div>
                </div>

                {/* Primary Action Button — pinned to the bottom of the column */}
                <div className="mt-6 md:self-end lg:mt-auto lg:pt-6">
                  <button
                    onClick={handleTriggerFill}
                    className="w-full rounded-xl bg-gradient-to-r from-[#0066FF] via-blue-600 to-cyan-500 py-3 text-xs font-bold text-white shadow-md shadow-blue-500/25 transition-all hover:opacity-95"
                  >
                    ⚡ Autofill Form (1-Click)
                  </button>
                  <p className="mt-2 text-center text-[11px] text-slate-500 font-medium">
                    Pressing Autofill populates inputs instantly.
                  </p>
                </div>
              </div>

            </div>
          </div>
        ) : (
          /* Manual vs AI Comparison Grid */
          <div className="mt-10 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-0">
            {/* The Old Way */}
            <div className="relative overflow-hidden rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-50 via-rose-50/60 to-white p-6 shadow-sm sm:p-8">
              <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[1.05fr_1fr]">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                    <X aria-hidden size={14} strokeWidth={3} />
                    THE OLD WAY (Manual Typing)
                  </span>
                  <h3 className="mt-4 text-xl font-extrabold text-slate-900 sm:text-2xl">
                    15+ Minutes Per Application
                  </h3>
                  <ul className="mt-5 space-y-4 text-sm font-medium text-slate-700">
                    {OLD_WAY_POINTS.map((point) => (
                      <li key={point} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                          <X aria-hidden size={14} strokeWidth={3} />
                        </span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Image
                  src="/home/manual-typing-stress.png"
                  alt="Stressed operator surrounded by Aadhaar, PAN and certificate files while typing a form manually"
                  width={1200}
                  height={896}
                  sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 90vw"
                  className="h-auto w-full rounded-2xl mix-blend-multiply"
                />
              </div>
            </div>

            {/* Center transition badge */}
            <div className="relative z-10 flex items-center justify-center lg:-mx-7">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0066FF] shadow-lg shadow-blue-500/15 lg:h-16 lg:w-16">
                <ArrowRight aria-hidden size={28} strokeWidth={2.5} className="rotate-90 lg:rotate-0" />
              </span>
            </div>

            {/* The New Way */}
            <div className="relative overflow-hidden rounded-3xl border-2 border-blue-400 bg-gradient-to-br from-blue-50 via-blue-50/50 to-white p-6 shadow-lg shadow-blue-500/10 sm:p-8">
              <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[1.05fr_1fr]">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                    <Check aria-hidden size={14} strokeWidth={3} />
                    THE NEW WAY (Bharatfill AI)
                  </span>
                  <h3 className="mt-4 text-xl font-extrabold text-slate-900 sm:text-2xl">
                    3 Seconds 1-Click Autofill
                  </h3>
                  <ul className="mt-5 space-y-4 text-sm font-medium text-slate-800">
                    {NEW_WAY_POINTS.map((point) => (
                      <li key={point} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <Check aria-hidden size={14} strokeWidth={3} />
                        </span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Image
                  src="/home/ai-autofill-preview.png"
                  alt={`Government form autofilled by Bharatfill AI with the address ${DEMO_DELHI_ADDRESS}, marked "Form filled in 3 seconds!"`}
                  width={1200}
                  height={896}
                  sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 90vw"
                  className="h-auto w-full mix-blend-multiply"
                />
              </div>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}
