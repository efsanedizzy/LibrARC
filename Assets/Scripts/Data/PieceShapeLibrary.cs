using System.Collections.Generic;
using UnityEngine;

namespace BlockPlus.Data
{
    [CreateAssetMenu(menuName = "BlockPlus/Pieces/Shape Library", fileName = "PieceShapeLibrary")]
    public sealed class PieceShapeLibrary : ScriptableObject
    {
        [SerializeField] private List<PieceShapeData> shapes = new List<PieceShapeData>();

        public IReadOnlyList<PieceShapeData> Shapes => shapes;

        public PieceShapeData GetRandomShape()
        {
            if (shapes.Count == 0)
            {
                Debug.LogError("PieceShapeLibrary is empty. Create shape assets before starting the game.");
                return null;
            }

            return shapes[Random.Range(0, shapes.Count)];
        }

#if UNITY_EDITOR
        public void SetEditorShapes(List<PieceShapeData> newShapes)
        {
            shapes = newShapes;
        }
#endif
    }
}
