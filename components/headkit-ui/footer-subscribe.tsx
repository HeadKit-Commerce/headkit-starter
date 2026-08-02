"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { subscribeEmailAction } from "@/lib/email-marketing-actions";
import { useToast } from "@/hooks/use-toast";

/**
 * Footer mailing-list subscribe. Only mounted when email marketing is enabled
 * for the store (Klaviyo connected).
 */
export function FooterSubscribe() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;

    startTransition(async () => {
      const result = await subscribeEmailAction({
        email: value,
        source: "footer",
      });
      if (result.success) {
        setEmail("");
        toast({
          title: "Subscribed",
          description: "Thanks — you're on the list.",
        });
        return;
      }
      toast({
        variant: "destructive",
        title: "Could not subscribe",
        description: result.error ?? "Please try again.",
      });
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-primary font-semibold text-lg">Subscribe</Label>
      {/* Below lg the column is too narrow for the overlaid button (it sat on
          top of the input, hiding the text — F7): stack input + button. From
          lg: keep the overlay look, with input padding so text never runs
          under the button. */}
      <form
        onSubmit={handleSubmit}
        className="relative flex flex-col gap-2 lg:flex-row"
      >
        <Input
          type="email"
          name="email"
          placeholder="Enter your email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          className="lg:pr-28"
          autoComplete="email"
        />
        <Button
          type="submit"
          className="lg:absolute lg:right-0 lg:top-0"
          disabled={isPending}
          loading={isPending}
        >
          Subscribe
        </Button>
      </form>
    </div>
  );
}
