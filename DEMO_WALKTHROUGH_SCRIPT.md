# 🎥 GigPay 3–5 Minute Demo Walkthrough Video Storyboard
**SDF Instawards Sprint 2 &bull; SOW Deliverable 4 Requirement (Armielyn Obinguar)**

Use this exact timing and talking points script to record your **Loom or Screen Recording** demo in **3 to 4 minutes**.

---

### **Video Checklist (What Armielyn Will Check Off):**
- [ ] Task Creation & Escrow Funding
- [ ] Dual-Wallet (Client & Freelancer) Interaction
- [ ] Real-Time Cross-Window Synchronization (0ms Load & Storage Events)
- [ ] Freelancer Proof-of-Work Submission (GitHub PR, Docs, Loom link)
- [ ] Client Dispute Freeze Demonstration (Release Locked)
- [ ] Release Confirmation Modal (Typing "CONFIRM")
- [ ] Public Verification Ledger & 1-Click CSV Export
- [ ] Stellar Expert On-Chain Transaction Verification (`CAUU2O...7RD3`)

---

### **⏱️ Minute-by-Minute Script:**

#### **0:00 – 0:45 | Introduction & Architecture**
- *"Hi everyone, I'm Mark Angel Guevarra, lead developer of GigPay for the Stellar Philippines Instawards Sprint 2. GigPay is a decentralized Web3 escrow platform that eliminates the 20% platform fee for freelancers with instant 5-second cross-border payments on Stellar Soroban Protocol 22."*
- *"Today, I'm demonstrating our Month 2 deliverables responding directly to Armielyn Obinguar's acceptance criteria: real-time state synchronization, zero-barrier onboarding, dispute mitigation freeze, milestone proof of work, and automated test verification."*

#### **0:45 – 1:30 | 1-Click Simulator & Escrow Funding**
- *"Notice that I have two browser windows open side-by-side: on the left is our Client Portal, and on the right is our Freelancer Portal."*
- *"Non-crypto testers can jump in immediately without installing browser extensions. I'll click 'Fill Sample Task' for 2 XLM and click 'Lock Funds in Escrow'."*
- *"Watch the Freelancer window on the right: in under 50 milliseconds, via our resilient `gigpay_shared_tasks` cache and storage events, the new task appears without any page refresh!"*

#### **1:30 – 2:15 | Freelancer Proof of Work Submission**
- *"Now, the Freelancer accepts the task. The status transitions instantly to 'In Progress'."*
- *"Per Armielyn's Deliverable 3 requirement, the freelancer must attach verifiable proof before escrow release. I'll click 'Attach Proof of Work Deliverables'."*
- *"I'll paste our GitHub PR link, our Google Doc deliverable link, and our Loom video link, then click 'Submit Deliverables'. Instantly, verified proof badges appear on both the client and freelancer dashboards."*

#### **2:15 – 3:00 | Dispute Mitigation Freeze & Release Confirmation**
- *"Now, let's demonstrate dispute protection. If the client needs revisions, they can click 'Freeze & Dispute'. The task immediately enters the 'Disputed' state, and the release button is locked, preventing premature payouts."*
- *"Once resolved, the client clicks 'Resolve Dispute'."*
- *"Now the client approves the release. Notice our safety modal: to eliminate accidental payouts, the client must type 'CONFIRM' in all-caps. Once typed, the Soroban `approve_task` transaction executes on-chain."*

#### **3:00 – 3:45 | Public Verification Ledger & Automated Test Suite**
- *"Finally, let's check our verification evidence. I'll click 'Public Ledger' in the top bar. Reviewers can see every single on-chain invocation, contract ID `CAUU2O5Z...`, transaction hashes, and direct Stellar Expert links."*
- *"With 1 click, I can click 'Export CSV' to download the full evidence ledger."*
- *"In the terminal, running `npm test` executes our full 18-test regression suite with 100% passing tests."*
- *"Thank you to the Stellar Development Foundation and Rise In for supporting GigPay!"*
