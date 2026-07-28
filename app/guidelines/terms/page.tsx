'use client'

import React from 'react'

export default function TermsOfServicePage() {
  return (
    <div
      className="bg-zinc-900 text-white font-sans min-h-screen py-10 overflow-y-auto"
      data-allow-touch-scroll
    >
      <main className="max-w-2xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
        <p className="mb-6">Effective Date: June 25, 2025</p>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">1. Acceptance of Terms</h2>
          <p>
            By accessing or using this assistant ("Service"), you agree to be bound by these Terms
            of Service ("Terms"). If you do not agree, do not use the Service.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">2. Service Description</h2>
          <p>
            The Service provides AI-powered assistance to answer questions and perform tasks as
            requested by users. Functionality may include data retrieval, analysis, and integration
            with OpenAI models and external tools such as Parallel web search.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">3. User Requirements</h2>
          <ul className="list-disc list-inside ml-6">
            <li>
              You must be at least 18 years old or have consent from a legal guardian to use the
              Service.
            </li>
            <li>
              You agree not to misuse the Service or attempt unauthorized access to its systems.
            </li>
            <li>You will not submit harmful, illegal, or infringing content.</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">4. AI and Search Providers</h2>
          <p>
            The Service uses OpenAI to process AI model requests and may use Parallel for web search
            and page extraction. Their use of data is governed by their respective Terms of Service
            and Privacy Policies.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">5. No Affiliation</h2>
          <p>
            This Service is an independent entity and is not affiliated with, endorsed by, or
            sponsored by any academic institution, government agency, or other organization unless
            explicitly stated. Any references to external entities are for informational purposes
            only.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">6. Rate Limiting</h2>
          <p>
            To ensure fair use and stable performance, we enforce rate limits on the number of API
            requests per user over a set time period. Excessive requests may result in temporary
            suspension. Contact support if you require higher limits.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">7. Disclaimer of Warranties</h2>
          <p>
            The Service is provided "as is" without warranties of any kind, express or implied,
            including fitness for a particular purpose.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">8. Limitation of Liability</h2>
          <p>
            Under no circumstances shall we be liable for indirect, incidental, or consequential
            damages arising from your use of the Service.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">9. Termination</h2>
          <p>
            We may suspend or terminate your access at any time for violations of these Terms or for
            maintenance reasons.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">10. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. Continued use after changes
            constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">11. Governing Law & Contact</h2>
          <p>
            These Terms are governed by applicable local laws. For questions or rate limit
            inquiries, contact{' '}
            <a href="mailto:support@vimegle.com" className="underline">
              here
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  )
}
