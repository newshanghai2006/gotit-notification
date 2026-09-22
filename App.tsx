import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, FlatList, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api, Message } from './src/api';
import { clearToken, getToken, saveToken } from './src/storage';
import { AUTH_MODE } from './src/config';

const colors = { ink: '#12212B', muted: '#6B7B84', line: '#E5ECEF', brand: '#0D8474', bg: '#F7FAF9', white: '#FFFFFF', danger: '#C24141' };
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const captchaChars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const loginText = {
  zh: { email: '邮箱', emailPlaceholder: 'name@example.com', captcha: '图形验证码', captchaPlaceholder: '输入图中字符', refresh: '刷新验证码', verified: '图形验证已通过', code: '邮箱验证码', codePlaceholder: '6 位验证码', send: '发送验证码', resend: '重新发送', login: '登录', devLogin: '进入测试', processing: '处理中...', invalidEmail: '请输入有效邮箱', invalidCaptcha: '图形验证码错误，请重新输入', devTitle: '开发模式', devMessage: '当前不会发送邮件，验证码校验通过后直接进入测试。', sent: '验证码已发送', sentMessage: '请检查邮箱。', failed: '操作失败', switchLanguage: 'English' },
  en: { email: 'Email', emailPlaceholder: 'name@example.com', captcha: 'Image captcha', captchaPlaceholder: 'Enter the characters', refresh: 'Refresh captcha', verified: 'Captcha verified', code: 'Email code', codePlaceholder: '6-digit code', send: 'Send code', resend: 'Resend', login: 'Log in', devLogin: 'Test login', processing: 'Working...', invalidEmail: 'Enter a valid email', invalidCaptcha: 'Captcha is incorrect', devTitle: 'Development mode', devMessage: 'No email will be sent. Pass the captcha to enter the test inbox.', sent: 'Code sent', sentMessage: 'Check your email.', failed: 'Request failed', switchLanguage: '中文' },
};

function makeCaptcha() { return Array.from({ length: 4 }, () => captchaChars[Math.floor(Math.random() * captchaChars.length)]).join(''); }

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getToken().then(setToken).finally(() => setLoading(false)); }, []);
  return <SafeAreaProvider>{loading
    ? <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
    : token
      ? <Inbox token={token} logout={async () => { await clearToken(); setToken(null); }} />
      : <Login onLogin={(next) => { saveToken(next); setToken(next); }} />}</SafeAreaProvider>;
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const devMode = AUTH_MODE === 'dev';
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [captcha, setCaptcha] = useState(makeCaptcha);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [sent, setSent] = useState(devMode);
  const [busy, setBusy] = useState(false);
  const copy = loginText[lang];

  const resetCaptcha = () => { setCaptcha(makeCaptcha()); setCaptchaInput(''); setCaptchaVerified(false); };
  const changeEmail = (value: string) => { setEmail(value); if (!devMode && sent) { setSent(false); setCode(''); resetCaptcha(); } };
  const validateCaptcha = () => {
    if (captchaInput.trim().toUpperCase() === captcha) return true;
    Alert.alert(copy.invalidCaptcha); resetCaptcha(); return false;
  };
  const requestCode = async () => {
    if (!email.includes('@')) return Alert.alert(copy.invalidEmail);
    if (!validateCaptcha()) return;
    if (devMode) return Alert.alert(copy.devTitle, copy.devMessage);
    setBusy(true);
    try { await api('/auth/request-code', undefined, { method: 'POST', body: { email } }); setSent(true); setCaptchaVerified(true); Alert.alert(copy.sent, copy.sentMessage); }
    catch (error) { Alert.alert(copy.failed, (error as Error).message); }
    finally { setBusy(false); }
  };
  const login = async () => {
    if (!email.includes('@')) return Alert.alert(copy.invalidEmail);
    if (devMode && !validateCaptcha()) return;
    setBusy(true);
    try {
      const result = await api<{ token: string }>(devMode ? '/auth/dev-login' : '/auth/verify-code', undefined, { method: 'POST', body: devMode ? { email } : { email, code } });
      onLogin(result.token);
    } catch (error) { Alert.alert(copy.failed, (error as Error).message); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.loginTop}><Text style={styles.logo}>gotit</Text><Pressable hitSlop={12} onPress={() => setLang(lang === 'zh' ? 'en' : 'zh')}><Text style={styles.language}>{copy.switchLanguage}</Text></Pressable></View>
        <Text style={styles.h1}>{lang === 'zh' ? '把重要提醒收好' : 'Keep every reminder close'}</Text>
        <Text style={styles.sub}>{devMode ? (lang === 'zh' ? '开发模式：验证码通过后即可测试。' : 'Development mode: pass the captcha to test.') : (lang === 'zh' ? '使用邮箱验证码登录，消息会像短信一样送达。' : 'Sign in with an email code and receive reminders like texts.')}</Text>
        <Text style={styles.label}>{copy.email}</Text>
        <TextInput style={styles.input} placeholder={copy.emailPlaceholder} autoCapitalize="none" keyboardType="email-address" returnKeyType="next" value={email} onChangeText={changeEmail} />
        {captchaVerified && !devMode ? <View style={styles.verifiedRow}><Text style={styles.verifiedText}>✓ {copy.verified}</Text></View> : <><Text style={styles.label}>{copy.captcha}</Text><View style={styles.captchaRow}>
          <TextInput style={[styles.input, styles.captchaInput]} placeholder={copy.captchaPlaceholder} autoCapitalize="characters" value={captchaInput} onChangeText={setCaptchaInput} />
          <CaptchaImage value={captcha} onRefresh={resetCaptcha} />
          <Pressable accessibilityLabel={copy.refresh} style={styles.refresh} onPress={resetCaptcha}><Text style={styles.refreshText}>↻</Text></Pressable>
        </View></>}
        {!devMode && <><Text style={styles.label}>{copy.code}</Text><View style={styles.codeRow}><TextInput style={[styles.input, styles.codeInput]} placeholder={copy.codePlaceholder} keyboardType="number-pad" value={code} onChangeText={setCode} /><Pressable style={styles.secondary} onPress={sent ? () => { setSent(false); setCode(''); resetCaptcha(); } : requestCode} disabled={busy}><Text style={styles.secondaryText}>{sent ? copy.resend : copy.send}</Text></Pressable></View></>}
        <Pressable style={[styles.primary, busy && styles.disabled]} onPress={login} disabled={busy || (!devMode && !sent)}><Text style={styles.primaryText}>{busy ? copy.processing : devMode ? copy.devLogin : copy.login}</Text></Pressable>
        <Text style={styles.foot}>{lang === 'zh' ? '继续即表示你同意服务条款与隐私政策' : 'By continuing, you agree to the Terms and Privacy Policy.'}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function CaptchaImage({ value, onRefresh }: { value: string; onRefresh: () => void }) {
  const rotations = useMemo(() => value.split('').map((_, index) => `${(index % 2 ? 1 : -1) * (5 + index)}deg`), [value]);
  return <Pressable accessibilityLabel="captcha" style={styles.captchaImage} onPress={onRefresh}>{value.split('').map((char, index) => <Text key={`${char}-${index}`} style={[styles.captchaChar, { transform: [{ rotate: rotations[index] }] }]}>{char}</Text>)}<View style={[styles.captchaLine, { transform: [{ rotate: '-8deg' }] }]} /><View style={[styles.captchaLine, styles.captchaLineSecond, { transform: [{ rotate: '12deg' }] }]} /></Pressable>;
}

function Inbox({ token, logout }: { token: string; logout: () => void }) {
  const [items, setItems] = useState<Message[]>([]);
  const [detail, setDetail] = useState<Message | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setRefreshing(true);
    try { const result = await api<{ messages: Message[] }>('/messages', token); setItems(result.messages); }
    catch (error) { Alert.alert('加载失败', (error as Error).message); }
    finally { setRefreshing(false); }
  };
  useEffect(() => {
    load();
    const setupNotifications = () => registerPush(token).catch((error) => Alert.alert('通知注册失败', error instanceof Error ? error.message : String(error), [{ text: '稍后再试', style: 'cancel' }, { text: '重试', onPress: setupNotifications }]));
    setupNotifications();
  }, [token]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (detail) { setDetail(null); return true; }
      if (selectionMode) { setSelectionMode(false); setSelectedIds(new Set()); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [detail, selectionMode]);

  const open = async (item: Message) => {
    if (selectionMode) return toggleSelection(item.id);
    setDetail(item);
    if (!item.read) {
      await api(`/messages/${item.id}/read`, token, { method: 'POST' }).catch(() => undefined);
      setItems((all) => all.map((message) => message.id === item.id ? { ...message, read: true } : message));
    }
  };
  const toggleSelection = (id: string) => setSelectedIds((current) => {
    const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const beginSelection = (id?: string) => { setSelectionMode(true); setSelectedIds(id ? new Set([id]) : new Set()); };
  const exitSelection = () => { setSelectionMode(false); setSelectedIds(new Set()); };
  const remove = (item: Message) => Alert.alert('删除消息？', '删除后无法恢复。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: async () => { await api(`/messages/${item.id}`, token, { method: 'DELETE' }); setDetail(null); setItems((all) => all.filter((message) => message.id !== item.id)); } }]);
  const removeSelected = () => {
    if (!selectedIds.size) return;
    Alert.alert(`删除 ${selectedIds.size} 条消息？`, '删除后无法恢复。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: async () => {
      try { await api('/messages/bulk-delete', token, { method: 'POST', body: { ids: Array.from(selectedIds) } }); setItems((all) => all.filter((message) => !selectedIds.has(message.id))); exitSelection(); }
      catch (error) { Alert.alert('删除失败', (error as Error).message); }
    } }]);
  };
  const generateToken = async () => {
    try {
      const result = await api<{ token: string }>('/me/api-token', token, { method: 'POST' });
      Alert.alert('API Token（仅显示这一次）', `${result.token}\n\n请点击“复制 Token”并保存。以后可以用它调用 /push 发送提醒。`, [{ text: '复制 Token', onPress: () => { Clipboard.setStringAsync(result.token); } }, { text: '关闭', style: 'cancel' }]);
    } catch (error) { Alert.alert('生成失败', (error as Error).message); }
  };

  if (detail) return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <View style={styles.detailHeader}>
      <Pressable style={styles.headerHitTarget} hitSlop={8} onPress={() => setDetail(null)}><Text style={styles.back}>返回</Text></Pressable>
      <Pressable style={styles.headerHitTarget} hitSlop={8} onPress={() => remove(detail)}><Text style={styles.delete}>删除</Text></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.detail}><Text style={styles.detailTitle}>{detail.title}</Text><Text style={styles.meta}>{detail.sender} · {date(detail.createdAt)}</Text><Text style={styles.body}>{detail.body}</Text></ScrollView>
  </SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <View style={styles.header}>
      <View style={styles.headerTop}><View><Text style={styles.eyebrow}>{selectionMode ? '批量管理' : '收件箱'}</Text><Text style={styles.headerTitle}>{selectionMode ? `已选择 ${selectedIds.size} 条` : '消息'}</Text></View><Pressable style={styles.headerHitTarget} onPress={selectionMode ? exitSelection : logout}><Text style={styles.logout}>{selectionMode ? '取消' : '退出'}</Text></Pressable></View>
      <View style={styles.toolbar}>{selectionMode ? <><Pressable onPress={() => setSelectedIds(new Set(items.map((item) => item.id)))}><Text style={styles.action}>全选</Text></Pressable><Pressable disabled={!selectedIds.size} onPress={removeSelected}><Text style={[styles.delete, !selectedIds.size && styles.disabledText]}>删除所选</Text></Pressable></> : <><Pressable onPress={generateToken}><Text style={styles.action}>获取 API Token</Text></Pressable><Pressable onPress={() => beginSelection()}><Text style={styles.action}>选择</Text></Pressable></>}</View>
    </View>
    <FlatList data={items} keyExtractor={(item) => item.id} refreshing={refreshing} onRefresh={load} contentContainerStyle={!items.length ? styles.emptyContainer : undefined} ListEmptyComponent={<View><Text style={styles.emptyTitle}>还没有消息</Text><Text style={styles.emptyText}>通过 API 推送的提醒会出现在这里。</Text></View>} renderItem={({ item }) => <Pressable style={styles.message} onPress={() => open(item)} onLongPress={() => beginSelection(item.id)}>
      {selectionMode ? <View style={[styles.checkbox, selectedIds.has(item.id) && styles.checkboxSelected]}>{selectedIds.has(item.id) && <Text style={styles.checkmark}>✓</Text>}</View> : <View style={[styles.dot, item.read && styles.readDot]} />}
      <View style={styles.copy}><View style={styles.messageTop}><Text style={[styles.messageTitle, item.read && styles.readText]} numberOfLines={1}>{item.title}</Text><Text style={styles.date}>{date(item.createdAt)}</Text></View><Text style={styles.sender}>{item.sender}</Text><Text style={styles.preview} numberOfLines={2}>{item.body}</Text></View>
    </Pressable>} />
  </SafeAreaView>;
}

async function registerPush(token: string) {
  if (Platform.OS === 'web' || isExpoGo || !Device.isDevice) return;
  const notifications = await import('expo-notifications');
  notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }) });
  if (Platform.OS === 'android') await notifications.setNotificationChannelAsync('default', { name: 'Gotit reminders', importance: notifications.AndroidImportance.MAX, vibrationPattern: [0, 250, 250, 250], sound: 'default' });
  let permissions = await notifications.getPermissionsAsync();
  if (permissions.status !== 'granted') permissions = await notifications.requestPermissionsAsync();
  if (permissions.status !== 'granted') throw new Error('通知权限未开启');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error('缺少 EAS projectId');
  let push: Awaited<ReturnType<typeof notifications.getExpoPushTokenAsync>> | undefined;
  let lastError: unknown;
  for (const delay of [0, 2000, 5000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try { push = await notifications.getExpoPushTokenAsync({ projectId }); break; }
    catch (error) { lastError = error; }
  }
  if (!push) {
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    if (detail.includes('SERVICE_NOT_AVAILABLE')) throw new Error('无法连接 Google FCM 服务。请确认手机已安装并启用 Google Play 服务，并尝试能访问 Google/Firebase 的网络。无 GMS 的手机无法使用 FCM 推送。');
    throw lastError;
  }
  await api('/devices', token, { method: 'POST', body: { pushToken: push.data } });
}

function date(value: string) { return new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }); }

const styles = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: colors.bg }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  loginScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 28 }, loginTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, logo: { color: colors.brand, fontSize: 42, fontWeight: '800' }, language: { color: colors.brand, fontSize: 14, fontWeight: '700' }, h1: { color: colors.ink, fontSize: 28, fontWeight: '700', marginTop: 26 }, sub: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 9, marginBottom: 18 }, label: { color: colors.muted, fontSize: 13, marginBottom: 6, marginTop: 8 }, input: { backgroundColor: colors.white, borderColor: colors.line, borderRadius: 8, borderWidth: 1, color: colors.ink, fontSize: 16, height: 50, paddingHorizontal: 14, marginBottom: 8 }, captchaRow: { alignItems: 'center', flexDirection: 'row', gap: 8 }, captchaInput: { flex: 1, minWidth: 90 }, captchaImage: { alignItems: 'center', backgroundColor: '#FFFDF5', borderColor: '#D5D4C8', borderRadius: 5, borderWidth: 1, flexDirection: 'row', height: 50, justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 6, width: 112 }, captchaChar: { color: '#1B4350', fontSize: 21, fontWeight: '800', letterSpacing: 1, marginHorizontal: 1 }, captchaLine: { backgroundColor: '#C97A54', height: 1, left: 5, position: 'absolute', right: 5, top: 24 }, captchaLineSecond: { backgroundColor: '#5B8DA1', top: 31 }, refresh: { alignItems: 'center', borderColor: colors.line, borderRadius: 8, borderWidth: 1, height: 50, justifyContent: 'center', width: 42 }, refreshText: { color: colors.brand, fontSize: 25 }, verifiedRow: { alignItems: 'center', backgroundColor: '#EAF7F3', borderColor: '#B8DED4', borderRadius: 8, borderWidth: 1, flexDirection: 'row', height: 44, marginBottom: 8, marginTop: 8, paddingHorizontal: 14 }, verifiedText: { color: colors.brand, fontSize: 14, fontWeight: '700' }, codeRow: { flexDirection: 'row', gap: 8 }, codeInput: { flex: 1 }, secondary: { alignItems: 'center', borderColor: colors.brand, borderRadius: 8, borderWidth: 1, height: 50, justifyContent: 'center', paddingHorizontal: 12 }, secondaryText: { color: colors.brand, fontWeight: '700' }, primary: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: 8, height: 52, justifyContent: 'center', marginTop: 18 }, primaryText: { color: colors.white, fontSize: 16, fontWeight: '700' }, foot: { color: colors.muted, fontSize: 12, marginTop: 17, textAlign: 'center' }, disabled: { opacity: 0.55 },
  header: { borderBottomColor: colors.line, borderBottomWidth: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 }, headerTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, headerHitTarget: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 52 }, toolbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40, paddingTop: 6 }, eyebrow: { color: colors.brand, fontSize: 12, fontWeight: '700', letterSpacing: 1 }, headerTitle: { color: colors.ink, fontSize: 28, fontWeight: '700', marginTop: 3 }, action: { color: colors.brand, fontSize: 14, fontWeight: '700' }, logout: { color: colors.muted, fontSize: 14 }, disabledText: { opacity: 0.45 },
  message: { backgroundColor: colors.white, borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16 }, dot: { backgroundColor: colors.brand, borderRadius: 5, height: 10, marginRight: 12, marginTop: 4, width: 10 }, readDot: { backgroundColor: colors.line }, checkbox: { alignItems: 'center', borderColor: colors.muted, borderRadius: 10, borderWidth: 1.5, height: 20, justifyContent: 'center', marginRight: 12, width: 20 }, checkboxSelected: { backgroundColor: colors.brand, borderColor: colors.brand }, checkmark: { color: colors.white, fontSize: 14, fontWeight: '800' }, copy: { flex: 1 }, messageTop: { flexDirection: 'row', justifyContent: 'space-between' }, messageTitle: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: '700', marginRight: 10 }, readText: { fontWeight: '500' }, date: { color: colors.muted, fontSize: 12 }, sender: { color: colors.brand, fontSize: 12, marginTop: 4 }, preview: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 }, emptyContainer: { flex: 1, justifyContent: 'center', padding: 28 }, emptyTitle: { color: colors.ink, fontSize: 21, fontWeight: '700', textAlign: 'center' }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 8, textAlign: 'center' },
  detailHeader: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 64, paddingHorizontal: 14, paddingVertical: 6 }, back: { color: colors.brand, fontSize: 16, fontWeight: '700' }, delete: { color: colors.danger, fontSize: 15, fontWeight: '700' }, detail: { backgroundColor: colors.white, flexGrow: 1, padding: 22 }, detailTitle: { color: colors.ink, fontSize: 24, fontWeight: '700', lineHeight: 31 }, meta: { color: colors.muted, fontSize: 13, marginTop: 10 }, body: { color: colors.ink, fontSize: 16, lineHeight: 28, marginTop: 30 },
});
