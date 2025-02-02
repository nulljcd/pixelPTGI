// g++ -std=c++17 -o main test.cpp -I/opt/homebrew/include -L/opt/homebrew/lib -lsfml-graphics -lsfml-window -lsfml-system
#include <iostream>
#include <SFML/Graphics.hpp>

int main()
{
  constexpr sf::Vector2u windowResolution(128 * 6, 128 * 6);
  constexpr sf::Vector2u renderResolution(128, 128);

  sf::RenderWindow window(sf::VideoMode(windowResolution), "title", sf::Style::Close);
  window.setVerticalSyncEnabled(true);

  std::vector<uint8_t> pixelIndexMapPixels(renderResolution.x * renderResolution.y * 4);
  sf::Texture pixelIndexMap(renderResolution);

  sf::Shader pixelPTGIShader;
  if (!pixelPTGIShader.loadFromFile("shader.frag", sf::Shader::Type::Fragment))
    return -1;

  sf::RenderTexture pixelPTGIrenderSpriteRenderTexture(renderResolution);
  const sf::Texture &pixelPTGIRenderSpriteTexture = pixelPTGIrenderSpriteRenderTexture.getTexture();
  sf::Sprite pixelPTGIRenderSprite(pixelPTGIRenderSpriteTexture);

  const sf::Vector2f pixelPTGIUResolution(renderResolution);
  sf::Texture pixelPTGIUPreviousRender(pixelPTGIRenderSpriteTexture);
  const sf::Texture &pixelPTGIUPixelIndexMap = pixelIndexMap;
  uint8_t pixelPTGIUCounter;

  pixelPTGIShader.setUniform("uResolution", pixelPTGIUResolution);
  pixelPTGIShader.setUniform("uPreviousRender", pixelPTGIUPreviousRender);
  pixelPTGIShader.setUniform("uPixelIndexMap", pixelPTGIUPixelIndexMap);
  pixelPTGIShader.setUniform("uCounter", pixelPTGIUCounter);

  sf::Texture displaySpriteTexture(renderResolution);
  sf::Sprite displaySprite(displaySpriteTexture);
  displaySprite.setScale({windowResolution.x / renderResolution.x, windowResolution.y / renderResolution.y});

  while (window.isOpen())
  {
    while (const std::optional event = window.pollEvent())
    {
      if (event->is<sf::Event::Closed>())
        window.close();

      if (const auto *keyPressed = event->getIf<sf::Event::KeyPressed>())
      {
        const int keyCode = int(keyPressed->code);
        int value = 0;

        if (keyCode >= 27 && keyCode <= 35)
          value = keyCode - 27;

        sf::Vector2i rawMousePosition = sf::Mouse::getPosition(window);
        pixelIndexMapPixels[(int(float(rawMousePosition.x) / float(windowResolution.x) * renderResolution.x) + int((1.0 - float(rawMousePosition.y) / float(windowResolution.y)) * renderResolution.y) * renderResolution.x) * 4] = value;
        pixelIndexMap.update(pixelIndexMapPixels.data());
        pixelPTGIShader.setUniform("uPixelIndexMap", pixelPTGIUPixelIndexMap);
      }
    }

    pixelPTGIShader.setUniform("uPreviousRender", pixelPTGIUPreviousRender);
    pixelPTGIShader.setUniform("uCounter", pixelPTGIUCounter);

    pixelPTGIUPreviousRender.update(pixelPTGIRenderSpriteTexture);

    pixelPTGIUCounter++;

    pixelPTGIrenderSpriteRenderTexture.clear();
    pixelPTGIrenderSpriteRenderTexture.draw(pixelPTGIRenderSprite, &pixelPTGIShader);
    pixelPTGIrenderSpriteRenderTexture.display();

    displaySpriteTexture.update(pixelPTGIRenderSpriteTexture);
    window.clear();
    window.draw(displaySprite);
    window.display();
  }
}