import { useEffect, useId, useImperativeHandle, useRef, type Ref } from 'react';
import type { CaptchaChallenge } from '../captcha/captchaClient';
import { useCaptchaClient } from '../captcha/useCaptchaClient';

/** Lo que la página puede pedirle al reto que está en pantalla. */
export interface CaptchaChallengeHandle {
  /** Deja el reto sin resolver (p. ej. tras un fallo de verificación). */
  reset(): void;
}

interface CaptchaChallengeWidgetProps {
  /** Instrucción que se muestra sobre el reto; cada página pone su propio texto de i18n. */
  text: string;
  /** Recibe el token al resolver el reto y `undefined` cuando caduca. */
  onToken: (token: string | undefined) => void;
  /** El reto no se ha podido pintar (el script de Google no carga o no responde). */
  onUnavailable: () => void;
  ref?: Ref<CaptchaChallengeHandle>;
}

/**
 * Reto reCAPTCHA v2 que una página muestra cuando el servidor lo pide (score v3 bajo). Se pinta al
 * montarse y se quita al desmontarse: la página lo monta solo mientras el reto está visible. Lo
 * comparten el registro y el inicio de sesión.
 */
export function CaptchaChallengeWidget({
  text,
  onToken,
  onUnavailable,
  ref,
}: CaptchaChallengeWidgetProps) {
  const captcha = useCaptchaClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const challengeRef = useRef<CaptchaChallenge>(undefined);
  const textId = useId();

  // Las funciones de la página cambian en cada render: se leen por referencia para que el reto no
  // se vuelva a pintar (y se pierda lo resuelto) cada vez que la página se renderiza.
  const onTokenRef = useRef(onToken);
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onTokenRef.current = onToken;
    onUnavailableRef.current = onUnavailable;
  });

  useImperativeHandle(ref, () => ({
    reset() {
      challengeRef.current?.reset();
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    let isCurrent = true;
    captcha
      .renderV2(container, (token) => {
        onTokenRef.current(token);
      })
      .then(
        (challenge) => {
          if (isCurrent) {
            challengeRef.current = challenge;
          } else {
            challenge.remove();
          }
        },
        () => {
          // Sin reto no se puede continuar: la página avisa de que la verificación no está disponible.
          if (isCurrent) {
            onUnavailableRef.current();
          }
        },
      );
    return () => {
      isCurrent = false;
      challengeRef.current?.remove();
      challengeRef.current = undefined;
    };
  }, [captcha]);

  return (
    <div className="mb-3">
      <p id={textId} className="mb-2">
        {text}
      </p>
      <div ref={containerRef} data-testid="captcha-challenge" aria-describedby={textId} />
    </div>
  );
}
