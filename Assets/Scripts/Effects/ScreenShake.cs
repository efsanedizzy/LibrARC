using System.Collections;
using UnityEngine;

namespace BlockPlus.Effects
{
    public sealed class ScreenShake : MonoBehaviour
    {
        [SerializeField] private RectTransform target;

        private Coroutine shakeRoutine;
        private Vector2 initialPosition;

        private void Awake()
        {
            initialPosition = target.anchoredPosition;
        }

        public void Shake(float amplitude, float duration)
        {
            if (shakeRoutine != null)
            {
                StopCoroutine(shakeRoutine);
            }

            shakeRoutine = StartCoroutine(ShakeRoutine(amplitude, duration));
        }

        private IEnumerator ShakeRoutine(float amplitude, float duration)
        {
            float elapsed = 0f;
            target.anchoredPosition = initialPosition;

            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                float strength = Mathf.Lerp(amplitude, 0f, elapsed / duration);
                target.anchoredPosition = initialPosition + Random.insideUnitCircle * strength;
                yield return null;
            }

            target.anchoredPosition = initialPosition;
            shakeRoutine = null;
        }
    }
}
