'use client';

import Link from 'next/link';
import { useActionState, useId, type ReactNode } from 'react';
import { ArrowRight, CheckCircle2, Loader2, MapPin, Phone, Send, Store } from 'lucide-react';
import { Alert } from '@assistigo/ui';
import { joinLaunchListAction, type LaunchLeadState } from '@/app/(auth)/actions';
import { LAUNCH_HONEYPOT_FIELD } from '@/lib/launch/leads';
import { useTranslations } from '@/lib/i18n/client';

const INPUT =
  'w-full min-w-0 bg-transparent px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:outline-none';

const FRAME =
  'flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40 transition-colors focus-within:border-[#0066FF] focus-within:ring-4 focus-within:ring-blue-500/10';

/**
 * The early-access form on the launch notice: WhatsApp number, shop name and city. Once the
 * server has accepted it, the form is replaced by the confirmation, so it cannot be sent twice
 * by a second tap.
 */
export function LaunchLeadForm() {
  const t = useTranslations();
  const ids = { whatsapp: useId(), shopName: useId(), city: useId() };
  const [state, formAction, pending] = useActionState<LaunchLeadState, FormData>(
    joinLaunchListAction,
    {},
  );

  if (state.joined) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-6 text-center"
      >
        <CheckCircle2 aria-hidden size={32} className="text-emerald-600" />
        <p className="text-base font-bold text-emerald-900">{t('launch.form.joinedTitle')}</p>
        <p className="text-sm leading-relaxed text-emerald-800">{t('launch.form.joinedBody')}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <Alert tone="danger">{t(state.error)}</Alert> : null}

      <div>
        <FieldLabel
          htmlFor={ids.whatsapp}
          icon={
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#25D366] text-white">
              <Phone aria-hidden size={12} fill="currentColor" strokeWidth={0} />
            </span>
          }
        >
          {t('launch.form.whatsapp')}
        </FieldLabel>
        <div className={FRAME}>
          <span className="flex shrink-0 items-center border-r border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-800">
            +91
          </span>
          <input
            id={ids.whatsapp}
            name="whatsapp"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98765 43210"
            maxLength={16}
            required
            className={INPUT}
          />
        </div>
      </div>

      <div className="grid gap-5 min-[420px]:grid-cols-2 min-[420px]:gap-4">
        <div>
          <FieldLabel
            htmlFor={ids.shopName}
            icon={<Store aria-hidden size={20} className="text-[#0066FF]" strokeWidth={2.2} />}
          >
            {t('launch.form.shopName')}
          </FieldLabel>
          <div className={FRAME}>
            <input
              id={ids.shopName}
              name="shopName"
              autoComplete="organization"
              placeholder={t('launch.form.shopNamePlaceholder')}
              maxLength={80}
              required
              className={INPUT}
            />
          </div>
        </div>
        <div>
          <FieldLabel
            htmlFor={ids.city}
            icon={<MapPin aria-hidden size={20} className="fill-rose-500 text-white" strokeWidth={2} />}
          >
            {t('launch.form.city')}
          </FieldLabel>
          <div className={FRAME}>
            <input
              id={ids.city}
              name="city"
              autoComplete="address-level2"
              placeholder={t('launch.form.cityPlaceholder')}
              maxLength={60}
              required
              className={INPUT}
            />
          </div>
        </div>
      </div>

      {/* Off-screen rather than display:none, which some bots know to skip. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name={LAUNCH_HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex cursor-pointer items-start gap-3.5">
        <input
          type="checkbox"
          name="consent"
          required
          // Never pre-ticked: consent under the DPDP Act has to be the person's own action.
          className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer rounded-md accent-[#0066FF]"
        />
        <span className="text-sm leading-relaxed text-slate-600">
          {t('launch.form.consent')}
          <Link
            href="/legal/privacy"
            className="mt-0.5 block w-fit font-semibold text-[#0052E0] hover:underline"
          >
            {t('auth.consentPrivacy')}
          </Link>
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="group flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#0052E0] via-[#0066FF] to-[#1F80FF] text-lg font-bold text-white shadow-[0_14px_30px_-10px_rgba(0,102,255,0.65)] transition-all duration-300 hover:shadow-[0_18px_36px_-10px_rgba(0,102,255,0.75)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 disabled:cursor-wait disabled:opacity-80 sm:h-[60px] sm:text-xl"
      >
        {pending ? (
          <Loader2 aria-hidden size={22} className="animate-spin" />
        ) : (
          <Send aria-hidden size={22} className="-rotate-12" />
        )}
        {t('launch.form.submit')}
        <ArrowRight
          aria-hidden
          size={22}
          className="transition-transform duration-300 group-hover:translate-x-1"
        />
      </button>
    </form>
  );
}

function FieldLabel({
  htmlFor,
  icon,
  children,
}: {
  htmlFor: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-slate-900"
    >
      {icon}
      {children}
      <span aria-hidden className="text-rose-500">
        *
      </span>
    </label>
  );
}
