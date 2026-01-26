
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Tab, BookingSubTab, ItineraryItem, FlightBooking, StayBooking, CarBooking, AttractionBooking, ShoppingItem, Expense } from './types';
import { DATE_RANGE, MEMBERS, Icons, FLIGHT_DB, DEFAULT_PACKING } from './constants';
import { magicalCorrectLocation, estimateTransportTime, getApiKeyStatus, testConnection } from './geminiService';
import { pushToRoom, subscribeToRoom } from './firebaseService';

const storage = {
  get: <T,>(key: string, defaultValue: T): T => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch { return defaultValue; }
  },
  set: (key: string, value: any) => localStorage.setItem(key, JSON.stringify(value))
};

const getTransportLink = (origin: string, destination: string, mode: 'transit' | 'drive' | 'walk') => {
  const travelMode = mode === 'drive' ? 'driving' : mode === 'walk' ? 'walking' : 'transit';
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${travelMode}`;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('itinerary');
  const [bookingTab, setBookingTab] = useState<BookingSubTab>('flights');
  const [selectedDay, setSelectedDay] = useState(DATE_RANGE[0].date);
  const [currentUser, setCurrentUser] = useState(storage.get('wizard_user', '小語'));

  const [itinerary, setItinerary] = useState<ItineraryItem[]>(storage.get('itinerary_muggle', []));
  const [flights, setFlights] = useState<FlightBooking[]>(storage.get('flights_muggle', []));
  const [stays, setStays] = useState<StayBooking[]>(storage.get('stays_muggle', []));
  const [cars, setCars] = useState<CarBooking[]>(storage.get('cars_muggle', []));
  const [attractions, setAttractions] = useState<AttractionBooking[]>(storage.get('attractions_muggle', []));
  const [shopping, setShopping] = useState<ShoppingItem[]>(storage.get('shopping_muggle', []));
  const [expenses, setExpenses] = useState<Expense[]>(storage.get('expenses_muggle', []));
  const [userPackingLists, setUserPackingLists] = useState<Record<string, string[]>>(storage.get('wizard_packing_lists', {}));
  const [packingChecked, setPackingChecked] = useState<Record<string, string[]>>(storage.get('packing_checked', {}));
  const [exchangeRate, setExchangeRate] = useState(0.215);

  // --- 即時同步核心設定：固定 ID ---
  const roomId = 'tokyo-witches'; 
  const [isLiveSync, setIsLiveSync] = useState(storage.get('magic_live_sync', true));
  const remoteUpdateRef = useRef(false);

  const [jpyInput, setJpyInput] = useState<string>('');
  const [twdInput, setTwdInput] = useState<string>('');
  const [isMagicLoading, setIsMagicLoading] = useState(false);
  const [showModal, setShowModal] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [syncString, setSyncString] = useState('');
  const [testResult, setTestResult] = useState<{ ok?: boolean; msg?: string }>({});

  // 1. 本地儲存與同步開關持久化
  useEffect(() => {
    storage.set('itinerary_muggle', itinerary);
    storage.set('flights_muggle', flights);
    storage.set('stays_muggle', stays);
    storage.set('cars_muggle', cars);
    storage.set('attractions_muggle', attractions);
    storage.set('shopping_muggle', shopping);
    storage.set('expenses_muggle', expenses);
    storage.set('wizard_packing_lists', userPackingLists);
    storage.set('packing_checked', packingChecked);
    storage.set('wizard_user', currentUser);
    storage.set('magic_live_sync', isLiveSync);
  }, [itinerary, flights, stays, cars, attractions, shopping, expenses, userPackingLists, packingChecked, currentUser, isLiveSync]);

  // 2. 推送變動到 Firebase (Debounced 避免過度頻繁)
  useEffect(() => {
    if (!isLiveSync) return;
    if (remoteUpdateRef.current) {
      remoteUpdateRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const allData = { itinerary, flights, stays, cars, attractions, shopping, expenses, userPackingLists, packingChecked };
      pushToRoom(roomId, allData);
    }, 1500);

    return () => clearTimeout(timer);
  }, [itinerary, flights, stays, cars, attractions, shopping, expenses, userPackingLists, packingChecked, isLiveSync]);

  // 3. 訂閱 Firebase 變動
  useEffect(() => {
    if (!isLiveSync) return;

    const unsubscribe = subscribeToRoom(roomId, (remoteData) => {
      remoteUpdateRef.current = true;
      if (remoteData.itinerary) setItinerary(remoteData.itinerary);
      if (remoteData.flights) setFlights(remoteData.flights);
      if (remoteData.stays) setStays(remoteData.stays);
      if (remoteData.cars) setCars(remoteData.cars);
      if (remoteData.attractions) setAttractions(remoteData.attractions);
      if (remoteData.shopping) setShopping(remoteData.shopping);
      if (remoteData.expenses) setExpenses(remoteData.expenses);
      if (remoteData.userPackingLists) setUserPackingLists(remoteData.userPackingLists);
      if (remoteData.packingChecked) setPackingChecked(remoteData.packingChecked);
    });

    return () => unsubscribe();
  }, [isLiveSync]);

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/JPY')
      .then(r => r.json())
      .then((d: any) => { if (d?.rates?.TWD) setExchangeRate(d.rates.TWD); })
      .catch(() => {});
  }, []);

  const sortedItinerary = useMemo(() => itinerary.filter(i => i.day === selectedDay).sort((a, b) => a.time.localeCompare(b.time)), [itinerary, selectedDay]);

  const handleToggleAction = (id: string) => {
    const next = new Set(expandedItems);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedItems(next);
  };

  const saveModal = () => {
    if (!editData) return;
    const id = editData.id || crypto.randomUUID();
    const data = { ...editData, id };

    if (showModal === 'itinerary') {
      const payload = { ...data, day: selectedDay };
      setItinerary(prev => editData.id ? prev.map(x => x.id === id ? payload : x) : [...prev, payload]);
    } else if (showModal === 'flight') setFlights(prev => editData.id ? prev.map(x => x.id === id ? data : x) : [...prev, data]);
    else if (showModal === 'stay') setStays(prev => editData.id ? prev.map(x => x.id === id ? data : x) : [...prev, data]);
    else if (showModal === 'car') setCars(prev => editData.id ? prev.map(x => x.id === id ? data : x) : [...prev, data]);
    else if (showModal === 'attraction') setAttractions(prev => editData.id ? prev.map(x => x.id === id ? data : x) : [...prev, data]);
    else if (showModal === 'shopping') setShopping(prev => editData.id ? prev.map(x => x.id === id ? data : x) : [...prev, data]);
    else if (showModal === 'packing') {
      const list = userPackingLists[currentUser] || DEFAULT_PACKING;
      const newList = editData.isNew ? [...list, editData.name] : list.map((x: string, i: number) => i === editData.index ? editData.name : x);
      setUserPackingLists(prev => ({ ...prev, [currentUser]: newList }));
    }
    else if (showModal === 'expense') {
      setExpenses(prev => editData.id ? prev.map(x => x.id === id ? data : x) : [...prev, { ...data, createdAt: Date.now() }]);
    }
    setShowModal(null);
  };

  const handleExport = () => {
    const fullData = { itinerary, flights, stays, cars, attractions, shopping, expenses, userPackingLists, packingChecked };
    const str = btoa(unescape(encodeURIComponent(JSON.stringify(fullData))));
    setSyncString(str);
    navigator.clipboard.writeText(str);
    alert('🧙‍♂️ 咒語已複製！');
  };

  const handleImport = () => {
    if (!syncString) return;
    try {
      const decoded = JSON.parse(decodeURIComponent(escape(atob(syncString))));
      if (confirm('確定要匯入覆蓋嗎？')) {
        if (decoded.itinerary) setItinerary(decoded.itinerary);
        if (decoded.expenses) setExpenses(decoded.expenses);
        // ... 其他欄位匯入
        alert('✨ 匯入成功！');
        setSyncString('');
      }
    } catch (e) { alert('❌ 咒語無效'); }
  };

  const renderMultiMember = (selected: string[], onChange: (val: string[]) => void) => (
    <div className="flex flex-wrap gap-2 mb-4">
      {MEMBERS.map(m => (
        <button key={m} onClick={() => onChange(selected.includes(m) ? selected.filter(x => x !== m) : [...selected, m])} className={`px-4 py-2 rounded-xl text-[10px] font-bold border transition-all ${selected.includes(m) ? 'bg-[#0E1A40] text-white border-transparent shadow-md' : 'bg-white text-gray-400 border-gray-100'}`}>{m}</button>
      ))}
    </div>
  );

  return (
    <div className="max-w-[480px] mx-auto min-h-screen bg-[#f5f5f5] flex flex-col relative shadow-2xl overflow-hidden pb-32">
      <header className="sticky top-0 z-40 glass border-b border-[#946A2D]/30 px-6 py-6 text-left flex justify-between items-end">
        <div><h1 className="serif text-2xl font-bold tracking-tight text-[#0E1A40]">東京小怪獸富士山巫師之旅</h1><p className="text-[9px] uppercase tracking-[0.3em] text-[#946A2D] font-bold mt-1">2026.01.29 - 02.02</p></div>
        <div className="text-right"><span className="text-[10px] font-bold bg-[#0E1A40] text-white px-3 py-1.5 rounded-full shadow-lg border border-[#946A2D]/40">{currentUser}</span></div>
      </header>

      <main className="flex-1 px-6 pt-2">
        {activeTab === 'itinerary' && (
          <div className="animate-fade-in space-y-6 mt-4">
            <div className="flex gap-2 overflow-x-auto pb-4">
              {DATE_RANGE.map((d, idx) => (
                <button key={d.date} onClick={() => setSelectedDay(d.date)} className={`flex-shrink-0 w-20 py-4 rounded-3xl flex flex-col items-center border transition-all ${selectedDay === d.date ? 'bg-[#0E1A40] text-white border-transparent shadow-xl' : 'bg-white text-gray-400 border-gray-100'}`}><span className="text-[10px] font-bold opacity-60 mb-1">{d.date.slice(5)}</span><span className="text-xl font-bold serif">{idx + 1}</span><span className="text-[9px] font-bold mt-1">週{d.dayOfWeek}</span></button>
              ))}
            </div>
            <div className="flex justify-between items-center px-1"><h2 className="serif text-xl font-bold border-l-4 border-[#0E1A40] pl-3">每日行程</h2><button onClick={() => { setEditData({ time: '09:00', stayDuration: '01:00', displayName: '', actualLocation: '', note: '', transportToNext: { mode: 'transit', duration: '' } }); setShowModal('itinerary'); }} className="text-[11px] font-bold bg-[#0E1A40] text-white px-4 py-2 rounded-full shadow-lg border border-[#946A2D]/30">＋ 新增行程</button></div>
            <div className="space-y-4">
              {sortedItinerary.map((item, idx) => (
                <div key={item.id} className="relative">
                  {idx > 0 && (
                    <div className="ml-12 my-2 p-3 bg-white/50 rounded-2xl border border-dashed border-gray-200 flex items-center justify-between gap-3 text-[10px] font-bold text-gray-400">
                      <div className="flex items-center gap-2">
                        <select 
                          value={item.transportToNext?.mode || 'transit'} 
                          onChange={(e) => setItinerary(prev => prev.map(it => it.id === item.id ? { ...it, transportToNext: { ...it.transportToNext!, mode: e.target.value as any } } : it))}
                          className="bg-transparent border-none outline-none text-[#946A2D] font-bold"
                        >
                          <option value="transit">🚇 大眾</option>
                          <option value="drive">🚗 駕車</option>
                          <option value="walk">🚶 步行</option>
                        </select>
                        <input 
                          type="text" 
                          value={item.transportToNext?.duration || ''} 
                          placeholder="時長"
                          onChange={(e) => setItinerary(prev => prev.map(it => it.id === item.id ? { ...it, transportToNext: { ...it.transportToNext!, duration: e.target.value } } : it))}
                          className="w-16 bg-transparent outline-none border-b border-gray-200 px-1 text-center"
                        />
                        <button onClick={async () => {
                          const prev = sortedItinerary[idx - 1];
                          setIsMagicLoading(true);
                          const time = await estimateTransportTime(prev.actualLocation, item.actualLocation, item.transportToNext?.mode || 'transit');
                          setItinerary(p => p.map(x => x.id === item.id ? { ...x, transportToNext: { ...x.transportToNext!, duration: time } } : x));
                          setIsMagicLoading(false);
                        }} className="text-[#946A2D]"><Icons.Magic /></button>
                      </div>
                      <a href={getTransportLink(sortedItinerary[idx-1].actualLocation, item.actualLocation, item.transportToNext?.mode || 'transit')} target="_blank" className="p-1.5 bg-[#0E1A40] text-white rounded-lg shadow-sm"><Icons.ExternalLink /></a>
                    </div>
                  )}
                  <div className="pl-12 border-l-2 border-dashed border-[#946A2D]/30 pb-4 group" onClick={() => handleToggleAction(item.id)}>
                    <div className="absolute left-[-16px] top-2 w-8 h-8 bg-[#0E1A40] rounded-full flex items-center justify-center text-white text-[10px] font-bold serif border-4 border-white">{(idx + 1).toString().padStart(2, '0')}</div>
                    <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 mb-2"><span>{item.time} ({item.stayDuration})</span>{expandedItems.has(item.id) && <div className="flex gap-2 animate-fade-in"><button onClick={(e) => { e.stopPropagation(); setEditData(item); setShowModal('itinerary'); }} className="text-[#0E1A40]"><Icons.Pencil /></button><button onClick={(e) => { e.stopPropagation(); setItinerary(itinerary.filter(i => i.id !== item.id)); }} className="text-[#ee463a]"><Icons.Trash /></button></div>}</div>
                    <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-md cursor-pointer">
                        <h3 className="font-bold serif text-[#0E1A40] text-lg flex items-center justify-between">{item.displayName}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.mapQuery || item.actualLocation)}`} target="_blank" className="text-[#946A2D]"><Icons.Map /></a></h3>
                        <p className="text-[10px] text-gray-400 mt-1 font-mono uppercase">{item.actualLocation}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'booking' && (
          <div className="animate-fade-in space-y-6 mt-4">
            <div className="flex gap-2 overflow-x-auto pb-2 border-b border-gray-200">
              {(['flights', 'stays', 'cars', 'attractions', 'packing', 'shopping'] as BookingSubTab[]).map(t => (
                <button key={t} onClick={() => setBookingTab(t)} className={`flex-shrink-0 px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all ${bookingTab === t ? 'bg-[#0E1A40] text-white shadow-md' : 'text-[#0E1A40]'}`}>{t === 'flights' ? '航班' : t === 'stays' ? '住宿' : t === 'cars' ? '租車' : t === 'attractions' ? '景點' : t === 'packing' ? '行李' : '購物'}</button>
              ))}
            </div>
            <button onClick={() => {
                 let init: any = { id: '', persons: [currentUser] };
                 if (bookingTab === 'flights') { init = { ...init, flightNo: '' }; setShowModal('flight'); }
                 else if (bookingTab === 'packing') { init = { name: '', isNew: true }; setShowModal('packing'); }
                 setEditData(init);
               }} className="w-full py-4 border-2 border-dashed border-[#946A2D]/30 rounded-3xl text-[#0E1A40] font-bold text-[10px] uppercase">＋ 新增 {bookingTab}</button>
          </div>
        )}

        {activeTab === 'split' && (
          <div className="animate-fade-in space-y-6 mt-4">
            <div className="w-full bg-[#0E1A40] rounded-[2.5rem] p-8 text-white shadow-2xl relative border border-[#946A2D]/30 overflow-hidden">
               <p className="text-[10px] uppercase opacity-60 font-bold mb-4 tracking-widest">魔法收支儀表板 (匯率: {exchangeRate})</p>
               <h2 className="serif text-2xl font-bold text-gray-300">$ {Math.round(expenses.reduce((s,e)=>s+(e.currency==='JPY'?e.amount*exchangeRate:e.amount),0)).toLocaleString()} TWD</h2>
            </div>
            <button onClick={() => { setEditData({ amount: 0, currency: 'JPY', content: '', category: '食', payers: [{name: currentUser, amount: 0}], splitters: MEMBERS.map(m => ({name: m, amount: 0})), paymentMethod: '現金', date: new Date().toISOString().split('T')[0] }); setShowModal('expense'); }} className="w-full bg-[#0E1A40] text-white py-5 rounded-3xl font-bold text-xs shadow-lg uppercase border border-[#946A2D]/50 transition-all active:scale-95">＋ 紀錄魔法支出</button>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="mt-6 animate-fade-in space-y-6">
            <div className="text-center"><div className="w-28 h-28 bg-[#946A2D]/20 rounded-full mx-auto flex items-center justify-center text-[#0E1A40] mb-4 border-8 border-white shadow-2xl"><Icons.User /></div><h2 className="serif text-3xl font-bold text-[#0E1A40]">{currentUser}</h2></div>
            
            <div className="bg-white rounded-[2.5rem] p-6 border border-gray-100 shadow-sm space-y-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">切換巫師身份</label>
              <div className="grid grid-cols-2 gap-3">{MEMBERS.map(m => (<button key={m} onClick={() => setCurrentUser(m)} className={`py-4 rounded-2xl font-bold text-sm transition-all ${currentUser === m ? 'bg-[#0E1A40] text-white shadow-xl' : 'bg-[#f5f5f5] text-[#0E1A40]'}`}>{m}</button>))}</div>
            </div>

            {/* 即時同步區塊：簡化並固定 ID */}
            <div className="bg-[#0E1A40] rounded-[2.5rem] p-6 border border-[#946A2D]/30 shadow-xl space-y-4">
              <label className="text-[10px] font-bold text-[#946A2D] uppercase tracking-widest px-2 flex items-center gap-2"><Icons.Magic /> 團隊同步魔法 (Live Sync)</label>
              <div className="bg-white/5 p-4 rounded-2xl flex items-center justify-between border border-white/10">
                <div>
                   <p className="text-[11px] text-white font-bold">頻道：<span className="text-[#946A2D] font-mono">{roomId}</span></p>
                   <p className="text-[8px] text-white/40 mt-1 uppercase">全自動同步連線中</p>
                </div>
                <button 
                  onClick={() => setIsLiveSync(!isLiveSync)} 
                  className={`px-4 py-2 rounded-full text-[9px] font-bold shadow-lg transition-all active:scale-95 ${isLiveSync ? 'bg-[#946A2D] text-[#0E1A40]' : 'bg-gray-700 text-gray-300'}`}
                >
                  {isLiveSync ? '⚡️ 同步生效中' : '❌ 已暫停'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] p-6 border-l-8 border-[#0E1A40] shadow-sm space-y-4">
              <label className="text-[10px] font-bold text-[#0E1A40] uppercase tracking-widest px-2 flex items-center gap-2">🔮 魔法診斷</label>
              <button onClick={async () => { setTestResult({ msg: "正在測試..." }); const res = await testConnection(); setTestResult(res); }} className="w-full bg-[#f5f5f5] text-[#0E1A40] py-3 rounded-xl text-[10px] font-bold shadow-md active:scale-95">🪄 測試連線</button>
              {testResult.msg && <div className={`p-3 rounded-xl text-[9px] font-bold border ${testResult.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>{testResult.msg}</div>}
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-6 left-4 right-4 max-w-[448px] mx-auto glass rounded-[2.5rem] border border-[#946A2D]/40 py-4 px-6 shadow-2xl z-50 flex justify-between items-center">
        {(['itinerary', 'booking', 'split', 'settings'] as Tab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`flex flex-col items-center gap-1 w-1/4 transition-all ${activeTab === tab ? 'text-[#0E1A40] scale-110' : 'text-[#946A2D]'}`}>
            {tab === 'itinerary' ? <Icons.Map /> : tab === 'booking' ? <Icons.Ticket /> : tab === 'split' ? <Icons.Wallet /> : <Icons.User />}
            <span className="text-[8px] font-bold uppercase">{tab}</span>
          </button>
        ))}
      </nav>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-10">
          <div className="absolute inset-0 bg-[#0E1A40]/40 backdrop-blur-md" onClick={() => setShowModal(null)}></div>
          <div className="bg-white w-full max-w-md rounded-[3rem] p-8 z-10 shadow-2xl animate-fade-in overflow-y-auto max-h-[90vh] border-t-[10px] border-[#0E1A40]">
             <div className="space-y-4">
               {showModal === 'itinerary' && (
                 <>
                   <input type="time" value={editData.time} onChange={e => setEditData({ ...editData, time: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" />
                   <input type="text" placeholder="景點名稱" value={editData.displayName} onChange={e => setEditData({ ...editData, displayName: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" />
                   <input type="text" placeholder="地址" value={editData.actualLocation} onChange={e => setEditData({ ...editData, actualLocation: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" />
                 </>
               )}
               {showModal === 'expense' && (
                 <>
                   <input type="number" placeholder="金額" value={editData.amount || ''} onChange={e => setEditData({ ...editData, amount: Number(e.target.value) })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" />
                   <input type="text" placeholder="內容" value={editData.content} onChange={e => setEditData({ ...editData, content: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" />
                 </>
               )}
               <button onClick={saveModal} className="w-full bg-[#0E1A40] text-white py-6 rounded-3xl font-bold uppercase tracking-widest shadow-xl border border-[#946A2D]/40 mt-4 active:scale-95 transition-all">保存咒語</button>
             </div>
          </div>
        </div>
      )}
      {isMagicLoading && <div className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-md flex items-center justify-center"><div className="bg-white p-10 rounded-[3rem] shadow-2xl animate-bounce"><Icons.Magic /></div></div>}
    </div>
  );
};

export default App;
