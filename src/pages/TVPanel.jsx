// Diário (esquerda; 10 itens)
let unsubDiaries = () => {};

// detecta WebViews de TV/TV box
const isTvLike = (() => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Tizen|Web0S|SmartTV|Android\s?TV|; wv;|AFT|MiBOX|HBBTV|DTV/i.test(ua);
})();

if (isTvLike) {
  // 📡 Modo polling a cada 30s: usa getDocsFromServer (sem cache/IndexedDB)
  const fetchDiary = async () => {
    try {
      const snap = await getDocsFromServer(query(collection(db, "diary_feed"), limit(10)));
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() || {}) }));
      list.sort((a, b) => {
        const da = a?.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const dbt = b?.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return dbt - da;
      });
      setDiaryFeed(list);
      setDiaryError(null);
    } catch (e) {
      console.error("[diary_feed] polling TV falhou", e);
      setDiaryError(e?.code || e?.message || "erro");
    }
  };
  fetchDiary();
  const id = setInterval(fetchDiary, 30000);
  unsubDiaries = () => clearInterval(id);
} else {
  // 💬 Navegadores normais continuam com onSnapshot (tempo-real)
  unsubDiaries = onSnapshot(
    query(collection(db, "diary_feed"), orderBy("createdAt", "desc"), limit(10)),
    (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() || {}) }));
      setDiaryFeed(list);
      setDiaryError(null);
    },
    async (err) => {
      console.error("[diary_feed] onSnapshot error", err);
      setDiaryError(err?.code || err?.message || "erro");
      // fallback adicional p/ browsers problemáticos
      try {
        const snap = await getDocsFromServer(query(collection(db, "diary_feed"), limit(10)));
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() || {}) }));
        list.sort((a, b) => {
          const da = a?.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const dbt = b?.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return dbt - da;
        });
        if (list.length) setDiaryFeed(list);
      } catch (e) {
        console.error("[diary_feed] fallback getDocsFromServer falhou", e);
      }
    }
  );
}
