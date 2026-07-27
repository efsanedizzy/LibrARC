using BlockPlus.Data;
using UnityEngine;

namespace BlockPlus.Pieces
{
    public sealed class RuntimePiece
    {
        public RuntimePiece(PieceShapeData shape, Color tint)
        {
            Shape = shape;
            Tint = tint;
        }

        public PieceShapeData Shape { get; }
        public Color Tint { get; }
        public int CellCount => Shape == null ? 0 : Shape.CellCount;
        public string DisplayName => Shape == null ? "Unknown Piece" : Shape.DisplayName;
    }
}
