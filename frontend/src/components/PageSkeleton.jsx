// Per-page skeleton fallback. Sits INSIDE Layout (between the
// sidebar and the page content) so navigating /dashboard →
// /commissions never unmounts the sidebar — only the content area
// shows the placeholder. The skeleton mirrors the rough shape of
// every internal page (title row + 3-card grid) so the eye doesn't
// jump when the real content arrives.
//
// Used both as the route-level <Suspense fallback> in App.jsx and
// as the per-page in-component "loading=true" placeholder, so the
// visual stays continuous from chunk load → data load → real content.
export default function PageSkeleton() {
  return (
    <div style={{ padding: 24 }}>
      <style>{`
        @keyframes rb-skel-pulse { 0%,100% { opacity: .6 } 50% { opacity: 1 } }
        .rb-skel { background: #f1f5f9; border-radius: 10px; animation: rb-skel-pulse 1.4s ease-in-out infinite; }
      `}</style>
      <div className="rb-skel" style={{ width: 220, height: 28, marginBottom: 8 }} />
      <div className="rb-skel" style={{ width: 320, height: 14, marginBottom: 28 }} />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div className="rb-skel" style={{ flex: '1 1 220px', height: 96 }} />
        <div className="rb-skel" style={{ flex: '1 1 220px', height: 96 }} />
        <div className="rb-skel" style={{ flex: '1 1 220px', height: 96 }} />
      </div>
      <div className="rb-skel" style={{ height: 220, marginTop: 20 }} />
    </div>
  );
}
