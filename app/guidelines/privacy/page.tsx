"use client"

import React from 'react'

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-zinc-900 text-white font-sans min-h-screen py-10">
      <main className="max-w-2xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
        <p className="mb-6">Effective Date: June 25, 2025</p>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">1. Introduction</h2>
          <p>
            This Privacy Policy ("Policy") explains how we collect, use, and protect your
            information when you use our assistant ("we", "us"). By accessing or using the
            assistant, you agree to this Policy.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">2. Definitions</h2>
          <dl className="ml-4">
            <dt className="font-semibold">Personal Data</dt>
            <dd>Information relating to an identified or identifiable person.</dd>
            <dt className="font-semibold">Processing</dt>
            <dd>Any operation performed on Personal Data.</dd>
          </dl>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">3. Data Collection</h2>
          <ul className="list-disc list-inside ml-6">
            <li>Session data and anonymous analytics to improve service quality.</li>
            <li>Credentials (e.g., VTOP login) used in-session only, not stored thereafter.</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">4. Use of Information</h2>
          <p>We use collected data solely to operate, maintain, and improve the assistant.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">5. Third-Party Model Providers</h2>
          <p>
            When you interact with the assistant, requests may be processed by third-party AI model
            providers like Google. Their handling of your data is governed by their own Terms of Service and
            Privacy Policies. We encourage you to review those policies to understand how they may
            collect, use, or store data.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">6. Data Sharing</h2>
          <p>
            We do not sell or rent Personal Data. We may share information to comply with legal
            obligations or protect our rights.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">7. Data Security</h2>
          <p>
            We implement industry-standard measures to safeguard your data against unauthorized
            access or disclosure.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">8. Retention</h2>
          <p>Data is retained only as long as necessary to provide the service or meet legal duties.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">9. Your Rights</h2>
          <p>
            You may request access, correction, or deletion of your Personal Data by contacting us
            at the address below.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">10. Updates</h2>
          <p>
            We may update this Policy to reflect changes in practices or legal requirements. We will
            notify users of significant changes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">11. Contact</h2>
          <p>
            For questions or privacy requests, email{' '}
            <a href="mailto:privacy@vimegle.com" className="underline">
              here
            </a>.
          </p>
        </section>
      </main>
    </div>
  )
}
