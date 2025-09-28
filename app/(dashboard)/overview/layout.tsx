'use client';

import Link from 'next/link';
import { use, useState, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { CircleIcon, Home, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { signOut } from '@/app/(login)/actions';
import { useRouter } from 'next/navigation';
import { User } from '@/lib/db/schema';
import useSWR, { mutate } from 'swr';

function OverviewPage() {
return (
  <div>
    <h1></h1>
  </div>
);
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
      <section className="flex flex-col min-h-screen">
        <OverviewPage/>
        {children}
      </section>
    );
  }
  