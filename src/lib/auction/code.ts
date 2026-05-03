const auctionCodeCharacters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const auctionCodeLength = 7;

export function generateAuctionCode() {
  let code = "";

  for (let index = 0; index < auctionCodeLength; index += 1) {
    const randomIndex = Math.floor(Math.random() * auctionCodeCharacters.length);
    code += auctionCodeCharacters[randomIndex];
  }

  return code;
}
