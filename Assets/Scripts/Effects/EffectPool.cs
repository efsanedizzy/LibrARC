using System.Collections.Generic;
using UnityEngine;

namespace BlockPlus.Effects
{
    public sealed class EffectPool : MonoBehaviour
    {
        [System.Serializable]
        private struct EffectEntry
        {
            public EffectType type;
            public PooledEffect prefab;
            public int prewarmCount;
        }

        [SerializeField] private Transform poolRoot;
        [SerializeField] private EffectEntry[] entries;

        private readonly Dictionary<EffectType, Queue<PooledEffect>> pools = new Dictionary<EffectType, Queue<PooledEffect>>();
        private readonly Dictionary<EffectType, PooledEffect> prefabs = new Dictionary<EffectType, PooledEffect>();

        private void Awake()
        {
            for (int index = 0; index < entries.Length; index++)
            {
                EffectEntry entry = entries[index];
                pools[entry.type] = new Queue<PooledEffect>(entry.prewarmCount);
                prefabs[entry.type] = entry.prefab;

                for (int prewarmIndex = 0; prewarmIndex < entry.prewarmCount; prewarmIndex++)
                {
                    PooledEffect effect = CreateInstance(entry.type);
                    pools[entry.type].Enqueue(effect);
                }
            }
        }

        public void Play(EffectType type, Vector3 worldPosition)
        {
            if (!prefabs.ContainsKey(type))
            {
                return;
            }

            Queue<PooledEffect> queue = pools[type];
            PooledEffect effect = queue.Count > 0 ? queue.Dequeue() : CreateInstance(type);
            effect.Play(this, type, worldPosition);
        }

        public void Return(EffectType type, PooledEffect effect)
        {
            effect.gameObject.SetActive(false);
            effect.transform.SetParent(poolRoot, worldPositionStays: false);
            pools[type].Enqueue(effect);
        }

        private PooledEffect CreateInstance(EffectType type)
        {
            PooledEffect instance = Instantiate(prefabs[type], poolRoot);
            instance.gameObject.SetActive(false);
            return instance;
        }
    }
}
