"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/headkit-ui/auth-context";
import { Toaster } from "@/components/ui/toaster";

const navigation = [
  { name: "Profile", href: "/account/profile" },
  { name: "Addresses", href: "/account/addresses" },
  { name: "Orders", href: "/account/orders" },
  { name: "Wishlist", href: "/account/wishlist" },
];

/**
 * Sidebar nav isolated into its own component because usePathname() suspends
 * during prerender on routes whose params aren't enumerated (e.g.
 * /account/orders/[orderId]). Layouts sit ABOVE their segment's loading.tsx
 * boundary, so the hook must live below an explicit <Suspense> inside the
 * layout for the route to prerender.
 */
function SidebarNav() {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <div className="w-full md:w-64 space-y-1">
      {navigation.map((item) => (
        <Link
          key={item.name}
          href={item.href}
          className={cn(
            "block px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            pathname === item.href
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted",
          )}
        >
          {item.name}
        </Link>
      ))}
      <button
        onClick={() => signOut(true)}
        className="w-full text-left px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <Suspense fallback={<div className="w-full md:w-64" />}>
          <SidebarNav />
        </Suspense>

        {/* Content */}
        <div className="flex-1">{children}</div>
      </div>
      <Toaster />
    </div>
  );
}
