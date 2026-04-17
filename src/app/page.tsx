import Image from "next/image";
import Link from "next/link";

const programs = [
  {
    title: "MPC GENERAL",
    duration: "Intermediate Program",
    description:
      "Strong core preparation in Mathematics, Physics, and Chemistry for board exam success.",
  },
  {
    title: "MPC + JEE-MAINS",
    duration: "Integrated Program",
    description:
      "Board syllabus with focused JEE Main coaching, problem-solving practice, and test preparation.",
  },
  {
    title: "BiPC GENERAL",
    duration: "Intermediate Program",
    description:
      "Balanced learning in Biology, Physics, and Chemistry with a strong academic foundation.",
  },
  {
    title: "BiPC + NEET",
    duration: "Integrated Program",
    description:
      "Comprehensive BiPC academics with dedicated NEET coaching, structured practice, and mock tests.",
  },
];

const highlights = [
  "Experienced IITian and Doctor faculty",
  "Small batches with personal mentorship",
  "Weekly parent performance updates",
  "Scholarship tests and fee support",
];

const stats = [
  { label: "Students Trained", value: "12,000+" },
  { label: "Top Ranks in JEE/NEET", value: "650+" },
  { label: "Average Class Size", value: "35" },
  { label: "Years of Excellence", value: "14" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-blue-50 text-blue-950">
      <header className="sticky top-0 z-20 border-b border-blue-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600 sm:text-xs">
              Premier Educational Institute
            </p>
            <h1 className="text-base font-bold sm:text-2xl">Jr.KG to INTER</h1>
          </div>
          <Link
            href="/login"
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 sm:px-5"
          >
            Login
          </Link>
        </div>
      </header>

      <section className="bg-blue-100">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:py-20">
          <div className="space-y-6">
          <p className="inline-block rounded-full bg-indigo-100 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-700">
            Admissions Open 2026-27
          </p>
          <h2 className="text-3xl font-extrabold leading-tight sm:text-5xl">
            Build Your Rank With
            <span className="block text-indigo-600">Structured Preparation</span>
          </h2>
          <p className="max-w-xl text-sm text-blue-800 sm:text-lg">
            Comprehensive classroom and hybrid programs for JEE Main, JEE
            Advanced, and NEET aspirants. From fundamentals to advanced
            problem-solving, every stage is guided by expert mentors.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a
              href="#programs"
              className="w-full rounded-full bg-indigo-600 px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-indigo-500 sm:w-auto"
            >
              Explore Programs
            </a>
            <a
              href="#contact"
              className="w-full rounded-full border border-blue-300 bg-white px-6 py-3 text-center text-sm font-semibold text-blue-800 transition hover:bg-blue-100 sm:w-auto"
            >
              Contact Us
            </a>
          </div>
        </div>

          <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-lg shadow-blue-100/70 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-200/80 sm:p-6">
            <h3 className="text-lg font-bold text-blue-950">Why Parents Choose Us</h3>
            <ul className="mt-4 space-y-3 text-sm text-blue-900 sm:text-base">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-indigo-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-blue-100 bg-blue-50 p-3 transition duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:bg-white hover:shadow-md hover:shadow-blue-200/70"
                >
                  <p className="text-lg font-bold text-indigo-600">{stat.value}</p>
                  <p className="text-xs text-blue-700">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-12">
          <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-200/70 sm:p-8 md:p-10">
          <h2 className="text-2xl font-extrabold text-blue-700 sm:text-4xl">
            Welcome to SRI SAI Educational Institute
          </h2>
          <div className="mt-5 space-y-4 text-sm leading-relaxed text-blue-900 sm:text-base">
            <p>
              Where learning begins with care and grows with confidence. From Kindergarten to Intermediate, we provide a safe and supportive environment for every student.
            </p>
            <p>
              With experienced faculty and personal attention, we help students build strong academic foundations. We also offer focused coaching for JEE and NEET to prepare students for competitive success.
            </p>
            <p>
              At Sri Sai Educational Institute, we guide every learner toward a
              bright and confident future.
            </p>
          </div>
          </div>
        </div>
      </section>

      <section className="bg-blue-50">
        <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-12">
          <div className="grid gap-6 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-200/70 sm:p-8 lg:grid-cols-2 lg:gap-8 md:p-10">
          <div>
            <h3 className="text-2xl font-extrabold text-blue-700 sm:text-3xl">
              Our Learning Approach
            </h3>
            <p className="mt-2 text-sm italic text-blue-800 sm:text-base">
              Where Education Builds Strong Foundations
            </p>
            <p className="mt-5 text-sm leading-relaxed text-blue-900 sm:text-base">
              At Sri Sai Educational Institute, we believe in shaping students
              through a balanced approach to academics and personal growth. Our
              dedicated faculty understands the needs of learners at every
              stage-from Kindergarten to Intermediate.
            </p>

            <ul className="mt-6 space-y-4 text-sm text-blue-900 sm:text-base">
              <li>
                <p className="font-bold text-blue-950">Strong Academic Foundation</p>
                <p>Building clear concepts and subject knowledge for long-term success.</p>
              </li>
              <li>
                <p className="font-bold text-blue-950">
                  Competitive Exam Preparation
                </p>
                <p>
                  Focused coaching for JEE and NEET with structured guidance and
                  practice.
                </p>
              </li>
              <li>
                <p className="font-bold text-blue-950">Skill Development</p>
                <p>
                  Encouraging critical thinking, problem-solving, and independent
                  learning.
                </p>
              </li>
              <li>
                <p className="font-bold text-blue-950">Values & Discipline</p>
                <p>
                  Instilling responsibility, confidence, and strong moral values
                  in students.
                </p>
              </li>
              <li>
                <p className="font-bold text-blue-950">Smart Learning Methods</p>
                <p>
                  Using effective and modern teaching techniques to enhance
                  understanding.
                </p>
              </li>
            </ul>
          </div>

            <div className="min-h-[280px] overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 sm:min-h-[340px]">
              <Image
                src="/images/our learning approach.png"
                alt="Students learning with faculty support"
                width={1200}
                height={800}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-12">
          <div className="grid gap-6 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-200/70 sm:p-8 lg:grid-cols-2 lg:gap-8 md:p-10">
            <div className="order-1 min-h-[280px] overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 sm:min-h-[340px] lg:order-none">
              <Image
                src="/images/our commitment.png"
                alt="Teacher guiding students on campus"
                width={1200}
                height={800}
                className="h-full w-full object-cover"
              />
            </div>

            <div className="order-2 lg:order-none">
              <h3 className="text-2xl font-extrabold text-blue-700 sm:text-3xl">
                Our Commitment to Your Child&apos;s Future
              </h3>
              <p className="mt-5 text-sm leading-relaxed text-blue-900 sm:text-base">
                At Sri Sai Educational Institute, we build a strong foundation
                for academic success and overall development-from early
                education to JEE/NEET preparation.
              </p>

              <ul className="mt-6 space-y-4 text-sm text-blue-900 sm:text-base">
                <li>
                  <p className="font-bold text-blue-950">Academic Excellence</p>
                  <p>
                    Structured learning from Jr. KG to Intermediate, with expert
                    coaching for JEE and NEET.
                  </p>
                </li>
                <li>
                  <p className="font-bold text-blue-950">
                    Conceptual &amp; Analytical Skills
                  </p>
                  <p>
                    Focus on strong fundamentals, critical thinking, and
                    problem-solving abilities.
                  </p>
                </li>
                <li>
                  <p className="font-bold text-blue-950">
                    Emotional &amp; Social Development
                  </p>
                  <p>
                    Encouraging confidence, discipline, and positive social
                    values.
                  </p>
                </li>
                <li>
                  <p className="font-bold text-blue-950">Physical Well-being</p>
                  <p>
                    Promoting fitness, sports, and healthy lifestyle habits.
                  </p>
                </li>
                <li>
                  <p className="font-bold text-blue-950">
                    Creative &amp; Innovative Thinking
                  </p>
                  <p>
                    Fostering curiosity, creativity, and interactive learning.
                  </p>
                </li>
                <li>
                  <p className="font-bold text-blue-950">
                    Values &amp; Character Building
                  </p>
                  <p>
                    Instilling integrity, responsibility, and strong moral
                    values.
                  </p>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-blue-50">
        <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-12">
          <div className="grid gap-6 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-200/70 sm:p-8 lg:grid-cols-2 lg:gap-8 md:p-10">
            <div>
              <h3 className="text-2xl font-extrabold text-blue-700 sm:text-3xl">
                Campus Highlights
              </h3>

              <p className="mt-5 text-lg font-bold text-blue-950 sm:text-xl">
                Exclusively Designed for Holistic Learning:
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-blue-900 sm:text-base">
                <li>
                  Spacious, well-equipped classrooms with modern teaching aids
                </li>
                <li>
                  Safe play areas and facilities for physical activities
                </li>
                <li>
                  Dedicated spaces for creativity and interactive learning
                </li>
                <li>
                  Smart technology integration for enhanced education
                </li>
                <li>
                  Comfortable and student-friendly campus environment
                </li>
              </ul>

              <p className="mt-6 text-lg font-bold text-blue-950 sm:text-xl">
                Location Advantage:
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-blue-900 sm:text-base">
                <li>Conveniently located for easy accessibility</li>
                <li>Well-connected and safe surroundings</li>
                <li>Peaceful environment conducive to focused learning</li>
              </ul>
            </div>

            <div className="min-h-[280px] overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 sm:min-h-[340px]">
              <Image
                src="/images/campus highlights.png"
                alt="Campus highlights and student activities"
                width={1200}
                height={800}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="programs" className="border-y border-blue-100 bg-white py-12 sm:py-16">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <h3 className="text-2xl font-bold text-blue-950 sm:text-3xl">Our Academic Programs</h3>
          <p className="mt-3 max-w-2xl text-blue-800">
            Curated learning tracks for different class levels and exam goals,
            with continuous assessment and individualized feedback.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3">
            {programs.map((program) => (
              <article
                key={program.title}
                className="rounded-2xl border border-blue-100 bg-blue-50 p-5 transition duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:bg-white hover:shadow-lg hover:shadow-blue-200/70 sm:p-6"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  {program.duration}
                </p>
                <h4 className="mt-2 text-lg font-bold text-blue-950 sm:text-xl">{program.title}</h4>
                <p className="mt-3 text-sm text-blue-800">{program.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-blue-50">
        <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-12">
          <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-200/70 sm:p-8 md:p-10">
            <h3 className="text-2xl font-extrabold text-blue-700 sm:text-3xl">
              Ready to Shape Your Child&apos;s Bright Future?
            </h3>
            <p className="mt-5 text-sm leading-relaxed text-blue-900 sm:text-base">
              Sri Sai Educational Institute is more than just a school. It&apos;s
              a place where strong academic foundations are built, talents are
              nurtured, and students are prepared for lifelong success-from
              early learning to competitive exam excellence in a safe and
              supportive environment.
            </p>
          </div>
        </div>
      </section>

      <section id="contact" className="bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="rounded-3xl bg-blue-700 p-6 text-white transition duration-300 hover:-translate-y-1 hover:bg-blue-800 hover:shadow-xl hover:shadow-blue-300/60 sm:p-8 md:p-12">
          <h3 className="text-2xl font-bold sm:text-3xl">Visit Our Campus</h3>
          <p className="mt-3 max-w-2xl text-blue-100">
            Book a counseling session, attend a demo class, and get your
            personalized roadmap for JEE/NEET success.
          </p>
          <div className="mt-6 flex flex-col items-start gap-3 text-sm text-blue-100 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
            <p>Phone: +91 9573773459</p>
            <p>Email: admissions@jeeneetcoaching.in</p>
            <p>Address: 9-7-046, Yerra Gardens, Yanam, India</p>
            <a
              href="https://www.instagram.com/srisaiedu_yanam?igsh=emI1MGw4NHlsYmQ0"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 transition hover:text-white"
            >
              Instagram
            </a>
          </div>
          </div>
        </div>
      </section>
    </main>
  );
}
