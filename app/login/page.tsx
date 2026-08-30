'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter(); const [error,setError]=useState(''); const [loading,setLoading]=useState(false);
  async function login(e:FormEvent<HTMLFormElement>){e.preventDefault();setLoading(true);setError('');const form=new FormData(e.currentTarget);const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:form.get('email'),password:form.get('password')})});const json=await res.json();setLoading(false);if(!json.ok){setError(json.error);return}router.replace('/dashboard');router.refresh()}
  return <main className="login-page"><form className="login-card" onSubmit={login}><div className="login-mark">115</div><h1>HỆ THỐNG QUẢN LÝ ĐỒ VẢI</h1><p>Bệnh viện Ngoại khoa 115 Nghệ An</p><label>Email đăng nhập<input name="email" type="email" defaultValue="cssdngoaikhoa115@gmail.com" required autoFocus autoComplete="username" /></label><label>Mật khẩu<input name="password" type="password" required autoComplete="current-password" /></label>{error&&<div className="alert error">{error}</div>}<button className="btn primary" disabled={loading}>{loading?'Đang đăng nhập...':'Đăng nhập'}</button></form></main>
}
