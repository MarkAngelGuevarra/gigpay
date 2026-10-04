import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Zap, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const features = [
  {
    id: 1,
    icon: <Zap size={36} color="#00f2fe" style={{ marginBottom: '1.5rem' }} />,
    bgIcon: <Zap size={100} />,
    title: "Lightning Fast",
    shortDesc: "Powered by Stellar network, payments settle in under 5 seconds cross-border, directly to your wallet.",
    longDesc: "When a client approves your work, you don't want to wait a week for a bank wire. Using the Stellar network consensus protocol, GigPay settles international payments in 3-5 seconds. By leveraging USDC, you bypass traditional banking hours, FX fees, and SWIFT delays.",
    shadowColor: "rgba(59,130,246,0.3)",
    accentColor: "#00f2fe"
  },
  {
    id: 2,
    icon: <DollarSign size={36} color="#4ade80" style={{ marginBottom: '1.5rem' }} />,
    bgIcon: <DollarSign size={100} />,
    title: "Near-Zero Fees",
    shortDesc: "Stop giving 20% to traditional platforms. Keep exactly what you earn with fraction-of-a-cent fees.",
    longDesc: "Traditional gig platforms tax your hard work by taking up to 20% of your earnings. GigPay is a decentralized protocol, meaning there is no corporate middleman taking a cut. The only fee is the Stellar network transaction fee, which is a fraction of a cent.",
    shadowColor: "rgba(74,222,128,0.3)",
    accentColor: "#4ade80"
  },
  {
    id: 3,
    icon: <ShieldCheck size={36} color="#c084fc" style={{ marginBottom: '1.5rem' }} />,
    bgIcon: <ShieldCheck size={100} />,
    title: "Smart Escrow",
    shortDesc: "Funds are locked safely in a Soroban smart contract until the work is verified and approved.",
    longDesc: "Trust is the biggest barrier in freelance work. Our Soroban smart contracts ensure clients must fund the escrow before you start working. Once the funds are locked on-chain, you have a cryptographic guarantee that you will be paid upon approval.",
    shadowColor: "rgba(192,132,252,0.3)",
    accentColor: "#c084fc"
  }
];

const LandingPage = () => {
  const [selectedFeature, setSelectedFeature] = useState(null);

  return (
    <div style={{ paddingTop: '2rem', overflowX: 'hidden' }}>
      
      {/* Hero Section */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        style={{ textAlign: 'center', marginBottom: '6rem', position: 'relative' }}
      >
        <div style={{
          position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)',
          width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(0,0,0,0) 70%)',
          zIndex: -1, pointerEvents: 'none'
        }} />

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.4rem 1rem',
            borderRadius: '999px',
            background: 'rgba(0, 242, 254, 0.08)',
            border: '1px solid rgba(0, 242, 254, 0.25)',
            marginBottom: '1.5rem',
            boxShadow: '0 0 20px rgba(0, 242, 254, 0.15)'
          }}
        >
          <img src="/logo.png" alt="GigPay" style={{ width: '20px', height: '20px', borderRadius: '4px' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#00f2fe', letterSpacing: '0.5px' }}>
            Powered by Stellar Soroban · SCF Instaward 2026
          </span>
        </motion.div>

        <motion.h1 
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          style={{ fontSize: '4.5rem', marginBottom: '1.5rem', lineHeight: 1.1, letterSpacing: '-1px' }}
        >
          Instant Payouts.<br />
          <span style={{ background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Zero Middlemen.
          </span>
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          style={{ color: 'var(--text-muted)', fontSize: '1.25rem', maxWidth: '650px', margin: '0 auto 3rem auto' }}
        >
          The decentralized payment platform for gig workers in APAC. Get paid in USDC the second your job is done, directly to your Stellar wallet.
        </motion.p>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem' }}
        >
          <Link to="/freelancer" className="btn btn-primary" style={{ padding: '1rem 2.5rem', fontSize: '1.125rem', borderRadius: '2rem' }}>
            I'm a Freelancer <ArrowRight size={20} />
          </Link>
          <Link to="/client" className="btn btn-outline" style={{ padding: '1rem 2.5rem', fontSize: '1.125rem', borderRadius: '2rem', background: 'rgba(255,255,255,0.03)' }}>
            I'm a Client
          </Link>
        </motion.div>
      </motion.div>

      {/* Feature Cards Grid */}
      <motion.div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', textAlign: 'left', marginBottom: '4rem' }}>
        {features.map((feature) => (
          <motion.div 
            key={feature.id}
            onClick={() => setSelectedFeature(feature)}
            whileHover={{ y: -10, scale: 1.02, boxShadow: `0 20px 40px -10px ${feature.shadowColor}` }}
            whileTap={{ scale: 0.98 }}
            className="glass-panel"
            style={{ position: 'relative', overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', height: '100%' }}
          >
            <div style={{ position: 'absolute', top: 0, right: 0, padding: '1rem', opacity: 0.1, pointerEvents: 'none' }}>{feature.bgIcon}</div>
            <div>{feature.icon}</div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{feature.title}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>{feature.shortDesc}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Trendy Feature Modal */}
      <AnimatePresence>
        {selectedFeature && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
              zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
            }}
            onClick={() => setSelectedFeature(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="glass-panel"
              style={{
                maxWidth: '550px', width: '100%', position: 'relative',
                borderTop: `4px solid ${selectedFeature.accentColor}`,
                boxShadow: `0 25px 50px -12px ${selectedFeature.shadowColor}`,
                cursor: 'pointer'
              }}
              onClick={() => setSelectedFeature(null)}
            >
              <button 
                onClick={() => setSelectedFeature(null)} 
                style={{ position: 'absolute', top: '1rem', right: '1.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '2rem', lineHeight: 1 }}
              >
                &times;
              </button>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '50%' }}>
                  {React.cloneElement(selectedFeature.icon, { style: { marginBottom: 0 } })}
                </div>
                <h2 style={{ fontSize: '2rem', margin: 0 }}>{selectedFeature.title}</h2>
              </div>
              
              <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {selectedFeature.shortDesc}
              </p>
              
              <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.4)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ color: 'white', lineHeight: 1.7, fontSize: '1.05rem', margin: 0 }}>
                  {selectedFeature.longDesc}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
    </div>
  );
};

export default LandingPage;
