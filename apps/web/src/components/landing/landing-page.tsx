"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Camera, Check, ChevronDown, Footprints, History, Leaf, NotebookPen, Plus, Utensils } from "lucide-react";
import { HistoricalGlucoseChart, HISTORY_COLORS } from "@/components/home/historical-glucose-chart";
import { DEMO_CURRENT, DEMO_HISTORY, DEMO_LABELS } from "./demo-data";
import styles from "./landing-page.module.css";

const questions = [
  ["Where do the glucose readings come from?", "Connect your Dexcom account in Mealog to collect historical glucose readings around your meals. The Dexcom account must have Dexcom Follow enabled with at least one follower."],
  ["Do I need to take a photo?", "No. You can enter a meal manually. If you choose a photo, it is sent to OpenAI for an editable meal and carbohydrate estimate. Review the details before saving."],
  ["What do similar meals tell me?", "Mealog brings past meals with similar names and carbohydrate amounts into view, alongside available glucose readings and recorded context. It helps you revisit your own history; it does not predict a response or recommend an insulin dose."],
];

export default function LandingPage() {
  const [selected, setSelected] = useState(0);

  return <div className={styles.page}>
    <a href="#main" className={styles.skip}>Skip to content</a>
    <header className={styles.header}>
      <Link href="/discover" className={styles.wordmark} aria-label="Mealog home">meal<span>og</span><i aria-hidden="true" /></Link>
      <nav aria-label="Main navigation" className={styles.nav}><a href="#experience">The experience</a><a href="#details">How it works</a><a href="#questions">FAQ</a></nav>
      <Link href="/login" className={styles.signIn}>Log in <span aria-hidden="true">↗</span></Link>
    </header>

    <main id="main">
      <section className={styles.hero} aria-labelledby="hero-heading">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span className={styles.smallLine} /> YOUR MEALS, REMEMBERED.</p>
          <h1 id="hero-heading">Let past meals<br /><span>inform the next.</span></h1>
          <p className={styles.intro}>For people with diabetes using Dexcom. Record and revisit past meals and glucose trends, with your own data to inform glucose management decisions.</p>
          <div className={styles.heroActions}><Link className={styles.primary} href="/login">Start your meal journal</Link><div className={styles.heroNote}><span aria-hidden="true">✳</span><p>Less trying to remember.<br /><strong>More context to look back on.</strong></p></div></div>
        </div>

        <div className={styles.heroVisual} id="experience">
          <div className={styles.previewTop}><span><Utensils size={15} aria-hidden="true" /> A LITTLE LOOK INSIDE</span><span className={styles.sample}>Interactive preview</span></div>
          <div className={styles.appCard}>
            <div className={styles.appHeading}><div><p className={styles.overline}>YOUR MEAL HISTORY</p><h2>Similar meals</h2><p>Chicken rice · 60 g carbohydrates</p></div><span className={styles.saved}><Check size={12} aria-hidden="true" /> Meal saved</span></div>
            <div className={styles.legend}><span><i />This meal</span><span><i style={{ background: HISTORY_COLORS[selected] }} />Past meal</span></div>
            <div className={styles.chart}><HistoricalGlucoseChart history={DEMO_HISTORY} selected={selected} current={DEMO_CURRENT} /></div>
            <div className={styles.historyChoices} aria-label="Choose a sample past meal">{DEMO_LABELS.map((label, index) => <button key={label} aria-pressed={index === selected} onClick={() => setSelected(index)}><i style={{ background: HISTORY_COLORS[index] }} />{["Nov 10", "Nov 8", "Nov 5"][index]}</button>)}</div>
            <div className={styles.historyDetail} aria-live="polite"><span className={styles.contextIcon}>{selected === 0 ? <Footprints size={20} /> : selected === 1 ? <NotebookPen size={20} /> : <Leaf size={20} />}</span><div><strong>{DEMO_LABELS[selected]}</strong><p>{DEMO_HISTORY.matches[selected].meal.notes}</p></div><span className={styles.carbs}>60 g<span>carbs eaten</span></span></div>
          </div>
          <div className={styles.previewBottom}><span><span aria-hidden="true">↳</span> Pick a past meal. See its story.</span><span>Fictional sample data</span></div>
        </div>
      </section>

      <div className={styles.ribbon}><span>Core features:</span><div><Camera size={18} aria-hidden="true" /> AI photo logging</div><Plus size={14} aria-hidden="true" /><div><Activity size={18} aria-hidden="true" /> Glucose history</div><Plus size={14} aria-hidden="true" /><div><History size={18} aria-hidden="true" /> Similar meal lookup</div></div>

      <section className={styles.features} id="details" aria-labelledby="details-heading">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>BEHIND THE PROJECT</p><h2 id="details-heading">Three features.<br /><span>One connected journal.</span></h2></div><p>From a meal photo to a useful record: how Mealog brings AI, glucose data, and personal history together.</p></div>
        {/* Layout and hover-reveal treatment adapted from Magic UI's Bento Grid.
            https://magicui.design/docs/components/bento-grid
            Dashboard composition reference: https://ui.shadcn.com/blocks/dashboard */}
        <div className={styles.bento}>
          <article className={`${styles.featureCard} ${styles.photoCard}`}>
            <div className={styles.featureIcon}><Camera size={22} aria-hidden="true" /></div>
            <h3>AI photo logging</h3>
            <p>Turn a photo into a meal name and carb estimate with OpenAI. Review the assumptions and edit before saving.</p>
            <div className={styles.implementationVisual}>
              <div className={styles.miniFormTop}><Utensils size={20} aria-hidden="true" /><span>Photo to meal draft</span><span className={styles.demoPill}>Example</span></div>
              <dl className={styles.draftFields}><div><dt>Suggested meal</dt><dd>Chicken rice</dd></div><div><dt>Estimated carbohydrates</dt><dd>60 g</dd></div></dl>
              <p className={styles.exampleNote}>Assumption: one serving of rice. Portion size needs review.</p>
            </div>
            <footer className={styles.buildNote}>OpenAI Responses API · Structured outputs</footer>
          </article>
          <article className={`${styles.featureCard} ${styles.contextCard}`}>
            <div className={styles.featureIcon}><Activity size={22} aria-hidden="true" /></div>
            <h3>Glucose history</h3>
            <p>Collect Dexcom readings in the background and align them to each meal. Revisit the trend, with gaps preserved where data is missing.</p>
            <div className={styles.glucoseExample}><div className={styles.exampleHeading}><span>Readings around a meal</span><span>Sample data</span></div><div className={styles.miniChart}><HistoricalGlucoseChart history={null} selected={-1} current={DEMO_CURRENT} /></div></div>
            <footer className={styles.buildNote}>Dexcom Share · Background jobs · Recharts</footer>
          </article>
          <article className={`${styles.featureCard} ${styles.lookupCard}`}>
            <div><div className={styles.featureIcon}><History size={22} aria-hidden="true" /></div><h3>Similar meal lookup</h3><p>Match past meals by dish name and carb amount. Retrieve up to three relevant records with glucose curves and context.</p></div>
            <div className={styles.lookupVisual}><p className={styles.overline}>HOW A MATCH IS FOUND</p><ol className={styles.lookupSteps}><li><span>Match dish names</span></li><li><span>Compare carbs eaten</span></li><li><span>Retrieve past records</span></li></ol></div>
            <footer className={styles.buildNote}>OpenAI embeddings · Semantic matching · Caching</footer>
          </article>
        </div>
      </section>

      <section className={styles.questions} id="questions" aria-labelledby="questions-heading"><div><p className={styles.eyebrow}>Frequently Asked Questions</p><h2 id="questions-heading">A few things<br />to know.</h2></div><div className={styles.accordion}>{questions.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={18} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div></section>

      <section className={styles.finalCta}><span className={styles.asterisk} aria-hidden="true">✳</span><p className={styles.eyebrow}>ONE MEAL AT A TIME</p><h2>Make room for<br /><em>your mealog.</em></h2><Link href="/login" className={styles.primary}>Start your meal journal</Link></section>
    </main>
    <footer className={styles.footer}><Link href="/discover" className={styles.wordmark}>meal<span>og</span><i aria-hidden="true" /></Link><p>Your meals, remembered.</p><span>Made for a little more understanding.</span></footer>
  </div>;
}
